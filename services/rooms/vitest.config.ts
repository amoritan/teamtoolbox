import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // The local runtime can't do jurisdictions.
      miniflare: { bindings: { ROOM_JURISDICTION: 'none' } },
    }),
  ],
})
