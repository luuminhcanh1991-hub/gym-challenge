import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://<user>.github.io/gym-challenge/  → base = '/gym-challenge/'
// Có thể ghi đè bằng biến môi trường BASE_PATH khi build.
export default defineConfig({
  base: process.env.BASE_PATH || '/gym-challenge/',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1200 },
})
