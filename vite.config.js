import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // OneDrive exposes the project through a Windows reparse point. Keeping
    // the original path lets Vite run locally without requiring an IDE or a
    // system-wide development environment.
    preserveSymlinks: true,
  },
  server: {
    port: 3000,
    open: true,
  },
})

