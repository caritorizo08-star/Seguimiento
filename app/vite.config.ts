import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base = nombre exacto del repo en GitHub (https://caritorizo08-star.github.io/Seguimiento/)
export default defineConfig({
  base: '/Seguimiento/',
  plugins: [react()],
  // Fecha y hora de compilación (hora de Nicaragua), visible en la app para saber qué versión se está usando
  define: { __VERSION__: JSON.stringify(new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')) },
})
