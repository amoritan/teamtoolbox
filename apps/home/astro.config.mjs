import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://teamtoolbox.org',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    // Keeps the CSP strict: no inline styles to allow.
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
  vite: { plugins: [tailwindcss()] },
})
