import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'

const versionJson = (): import('vite').Plugin => ({
  name: 'version-json',
  writeBundle() {
    fs.writeFileSync('dist/version.json', JSON.stringify({ ts: Date.now() }))
  },
})

export default defineConfig({
  plugins: [react(), versionJson()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
})
