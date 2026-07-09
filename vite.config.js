import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build du front Pipeline TexasWin.
// - entrée = index.html (racine), qui référence /src/main.jsx et /src/overlay.jsx
// - sortie = dist/ (servi par server.js en prod)
// - public/ (societeinfo.js, services/navApi.js) est copié tel quel vers dist/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Le bundle applicatif reste volumineux (mono-fichier historique) : on relève
    // le seuil d'avertissement le temps du découpage progressif (phase 3).
    chunkSizeWarningLimit: 4000,
  },
})
