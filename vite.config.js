import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: base lấy từ BASE_PATH (workflow tự đặt), mặc định '/gym-challenge/'
const BUILD_ID = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : String(Date.now())

export default defineConfig({
  base: process.env.BASE_PATH || '/gym-challenge/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    { name: 'version-json', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) }) } },
  ],
  build: { chunkSizeWarningLimit: 1200 },
})
