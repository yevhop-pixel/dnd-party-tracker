import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base: сайт живёт на GitHub Pages по адресу /dnd-party-tracker/
export default defineConfig({
  base: '/dnd-party-tracker/',
  plugins: [react()],
})
