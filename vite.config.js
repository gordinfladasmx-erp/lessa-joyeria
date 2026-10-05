import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Divide el bundle en chunks más pequeños — el browser los carga en paralelo
    // y cachea los que no cambiaron entre deploys
    rollupOptions: {
      output: {
        manualChunks: {
          // Librerías React — cambian poco, se cachean por mucho tiempo
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase — pesado pero estable
          'vendor-supabase': ['@supabase/supabase-js'],
          // Gráficas — solo se cargan en páginas con charts
          'vendor-charts': ['chart.js', 'react-chartjs-2'],
          // PDF — solo se carga al generar reportes
          'vendor-pdf': ['jspdf'],
        },
      },
    },
    // Avisa solo si un chunk supera 600kb (antes era 500kb default)
    chunkSizeWarningLimit: 600,
  },
})
