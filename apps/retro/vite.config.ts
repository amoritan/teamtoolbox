import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { toolAppEnv } from '../../scripts/tool-app-vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), toolAppEnv()],
  build: {
    target: 'es2023',
    // Keeps the CSP strict: assets are files, never inlined as data URLs.
    assetsInlineLimit: 0,
  },
  test: { environment: 'happy-dom' },
})
