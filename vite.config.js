import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base: './' so the built app loads correctly from Electron's file:// protocol
export default defineConfig({
  plugins: [react()],
  base: './',
})
