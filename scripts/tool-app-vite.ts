/**
 * Shared Vite setup for tool apps (apps/<slug>, not the directory site).
 *
 * - Production builds talk to wss://rooms.teamtoolbox.org and https://ads.teamtoolbox.org,
 *   which only accept <slug>.teamtoolbox.org.
 * - Preview builds (TTB_PREVIEW=1, set by `preview:upload`) run on workers.dev, so they
 *   talk to the staging services instead, and dist/_headers is rewritten to allow exactly
 *   those two staging origins. Nothing else in the CSP changes.
 * - The dev server talks to the local services from `pnpm dev:rooms` and `pnpm dev:ads`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const PRODUCTION = { rooms: 'wss://rooms.teamtoolbox.org', ads: 'https://ads.teamtoolbox.org' }
const LOCAL = { rooms: 'ws://localhost:8787', ads: 'http://localhost:8788' }

/** The account's workers.dev subdomain (runbook, "Workers account setup"). */
const workersSubdomain = process.env.TTB_WORKERS_SUBDOMAIN ?? 'amoritan'
const STAGING = {
  rooms: `wss://rooms-staging.${workersSubdomain}.workers.dev`,
  ads: `https://ads-staging.${workersSubdomain}.workers.dev`,
}

export function toolAppEnv(): Plugin {
  const preview = process.env.TTB_PREVIEW === '1'
  let outDir = 'dist'
  let isBuild = false

  return {
    name: 'teamtoolbox-tool-app-env',
    config(_config, { command }) {
      isBuild = command === 'build'
      const urls = !isBuild ? LOCAL : preview ? STAGING : PRODUCTION
      return {
        define: {
          'import.meta.env.TTB_ROOMS_URL': JSON.stringify(urls.rooms),
          'import.meta.env.TTB_ADS_URL': JSON.stringify(urls.ads),
        },
      }
    },
    configResolved(config) {
      outDir = join(config.root, config.build.outDir)
    },
    closeBundle() {
      if (!isBuild || !preview) return
      const file = join(outDir, '_headers')
      const headers = readFileSync(file, 'utf8')
      const rewritten = headers
        .replaceAll(PRODUCTION.rooms, STAGING.rooms)
        .replaceAll(PRODUCTION.ads, STAGING.ads)
      if (rewritten === headers) throw new Error(`${file}: no service origins to rewrite`)
      writeFileSync(file, rewritten)
    },
  }
}
