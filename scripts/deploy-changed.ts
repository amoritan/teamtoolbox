/**
 * Runs a deploy script in every app and service that changed since a git ref, plus
 * anything that depends on a changed package. Used by deploy.yml and preview.yml.
 *
 *   node scripts/deploy-changed.ts <script> [<since-ref>]
 *
 * - Services go first, then apps, so an app never reaches a service older than it expects.
 * - One project at a time, and a failure doesn't stop the rest. A plain `pnpm -r run`
 *   kills the other deploys mid-upload as soon as one fails. The script still exits
 *   non-zero if anything failed.
 * - Without a since-ref, or with one that isn't in the history (first push, rewritten
 *   history), every app and service runs.
 * - A preview is a new version of an app's existing Worker, so a brand-new app has no
 *   preview until its first deploy from main. Its preview is skipped with a notice.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

interface DryRunTask {
  project: string
  missingScript: boolean
}

/** The codes Cloudflare (and wrangler) use for "no Worker with that name". */
const WORKER_NOT_FOUND = new Set([10007, 10090])

/** The Worker's name from the project's wrangler.jsonc, where it's the first `name` key. */
function workerName(project: string): string | null {
  try {
    const config = readFileSync(join(project, 'wrangler.jsonc'), 'utf8')
    return /"name"\s*:\s*"([^"]+)"/.exec(config)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * False only when Cloudflare says the Worker doesn't exist. Any other answer, or no
 * credentials, counts as yes: the upload then runs and reports its own errors.
 */
async function workerExists(project: string): Promise<boolean> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const token = process.env.CLOUDFLARE_API_TOKEN
  const name = workerName(project)
  if (!accountId || !token || !name) return true
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/services/${encodeURIComponent(name)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (response.ok) return true
    const body = (await response.json()) as { errors?: { code?: number }[] }
    return !body.errors?.some((error) => WORKER_NOT_FOUND.has(error.code ?? 0))
  } catch {
    return true
  }
}

const [script, since] = process.argv.slice(2)
if (!script) {
  console.error('Usage: node scripts/deploy-changed.ts <script> [<since-ref>]')
  process.exit(2)
}

const sinceIsKnown =
  !!since && spawnSync('git', ['cat-file', '-e', `${since}^{commit}`]).status === 0
const selection = sinceIsKnown ? ['--filter', `...[${since}]`] : []
if (!sinceIsKnown) console.log('No usable since-ref: running every app and service.')

const plan = spawnSync(
  'pnpm',
  ['--reporter=silent', '-r', ...selection, 'run', '--dry-run', '--json', '--if-present', script],
  { encoding: 'utf8' },
)
if (plan.status !== 0) {
  console.error(plan.stdout, plan.stderr)
  process.exit(1)
}
const { tasks } = JSON.parse(plan.stdout) as { tasks: DryRunTask[] }

/** Services first, then apps. Shared packages are never deployed on their own. */
const stage = (project: string): number =>
  project.startsWith('services/') ? 0 : project.startsWith('apps/') ? 1 : -1

const projects = tasks
  .filter((task) => !task.missingScript && stage(task.project) >= 0)
  .map((task) => task.project)
  .sort((a, b) => stage(a) - stage(b) || a.localeCompare(b))

if (projects.length === 0) {
  console.log(`Nothing to run "${script}" for.`)
  process.exit(0)
}
console.log(`Running "${script}" in order: ${projects.join(', ')}`)

const failed: string[] = []
for (const project of projects) {
  console.log(`\n── ${project} ──`)
  if (
    script === 'preview:upload' &&
    project.startsWith('apps/') &&
    !(await workerExists(project))
  ) {
    // A GitHub Actions annotation, so the skip shows on the run's summary page.
    console.log(
      `::notice title=No preview for ${project}::Its Worker doesn't exist yet. Previews start after its first deploy from main.`,
    )
    continue
  }
  const result = spawnSync('pnpm', ['--dir', project, 'run', script], { stdio: 'inherit' })
  if (result.status !== 0) failed.push(project)
}

if (failed.length > 0) {
  console.error(`\n"${script}" failed in: ${failed.join(', ')}`)
  process.exit(1)
}
