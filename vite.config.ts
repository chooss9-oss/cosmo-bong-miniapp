import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({

  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {

    host: "0.0.0.0",

    allowedHosts: [
      "reforms-floppy-skills-elizabeth.trycloudflare.com",
      "libs-technological-discs-flows.trycloudflare.com",
      "publicly-number-chambers-recommend.trycloudflare.com"
    ],

    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      }
    },

  },

})