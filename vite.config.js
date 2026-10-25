import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the API runs separately (npm run dev:server) and Vite proxies /api to it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
})
