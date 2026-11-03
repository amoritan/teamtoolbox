/**
 * Fails if any tool app could load code from, or connect to, a third party.
 * Every app must ship a `public/_headers` file. For tool apps (every app except
 * the directory site), the CSP may only allow our own origins.
 *
 * Run with `pnpm check:headers` (Node strips the types itself).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const APPS_DIR = join(import.meta.dirname, '..', 'apps')
/** The directory site may relax its CSP for AdSense. Everything else is a tool. */
const DIRECTORY_APP = 'home'

const ALLOWED_SOURCES: Record<string, readonly string[]> = {
  'default-src': ["'self'", "'none'"],
  'script-src': ["'self'"],
  'connect-src': ["'self'", 'wss://rooms.teamtoolbox.org', 'https://ads.teamtoolbox.org'],
  'frame-src': ["'none'"],
}

function readCsp(headersFile: string): Map<string, string[]> | null {
  const line = readFileSync(headersFile, 'utf8')
    .split('\n')
    .find((entry) => entry.trim().toLowerCase().startsWith('content-security-policy:'))
  if (!line) return null
  const policy = line.slice(line.indexOf(':') + 1)
  const directives = new Map<string, string[]>()
  for (const directive of policy.split(';')) {
    const [name, ...sources] = directive.trim().split(/\s+/)
    if (name) directives.set(name.toLowerCase(), sources)
  }
  return directives
}

const problems: string[] = []

for (const app of readdirSync(APPS_DIR, { withFileTypes: true })) {
  if (!app.isDirectory()) continue
  const headersFile = join(APPS_DIR, app.name, 'public', '_headers')
  if (!existsSync(headersFile)) {
    problems.push(`${app.name}: missing public/_headers`)
    continue
  }
  if (app.name === DIRECTORY_APP) continue

  const csp = readCsp(headersFile)
  if (!csp) {
    problems.push(`${app.name}: no Content-Security-Policy in public/_headers`)
    continue
  }
  for (const [directive, allowed] of Object.entries(ALLOWED_SOURCES)) {
    const sources = csp.get(directive)
    if (!sources) {
      problems.push(`${app.name}: CSP is missing ${directive}`)
      continue
    }
    for (const source of sources) {
      if (!allowed.includes(source)) problems.push(`${app.name}: ${directive} allows ${source}`)
    }
  }
}

if (problems.length > 0) {
  console.error('Tool apps must not load code from or connect to third parties:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('Headers OK: no tool app allows third-party scripts, connections or frames.')
