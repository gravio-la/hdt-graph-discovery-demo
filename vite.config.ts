import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  // Support GitHub Pages deployment with base path
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@graviola/hdt-rdfjs-dataset/dist/hdt.wasm',
          dest: '.',
        },
      ],
    }),
  ],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@graviola/hdt-rdfjs-dataset'],
  },
  publicDir: 'public',
})
