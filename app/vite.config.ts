import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base = nombre exacto del repo en GitHub (https://caritorizo08-star.github.io/Seguimiento/)
export default defineConfig({
  base: '/Seguimiento/',
  plugins: [react()],
})
