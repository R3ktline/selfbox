import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { mediaApiMiddleware } from './server/media-api.js'

// https://vite.dev/config/
export default defineConfig({
  assetsInclude: ['**/*.aff', '**/*.dic'],
  plugins: [
    react(),
    {
      name: 'media-download-api',
      configureServer(server) {
        server.middlewares.use(mediaApiMiddleware())
      },
      configurePreviewServer(server) {
        server.middlewares.use(mediaApiMiddleware())
      },
    },
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'pdf', test: /pdf-lib|pdfjs-dist/ },
            { name: 'heic', test: /heic2any/ },
            { name: 'markdown', test: /jspdf|marked|highlight\.js/ },
            { name: 'canvas', test: /html2canvas/ },
            { name: 'ocr', test: /tesseract\.js/ },
          ],
        },
      },
    },
  },
})
