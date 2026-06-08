import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// The Vue dev server proxies /api to the local Hono server so the browser
// always talks to a single origin (no CORS needed in the browser path).
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 8787}`,
        changeOrigin: true,
      },
    },
  },
})
