import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7011,
    proxy: {
      '/api': {
        target: 'http://localhost:7012',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:7012',
        ws: true
      }
    }
  },
  preview: {
    port: 7011
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})
