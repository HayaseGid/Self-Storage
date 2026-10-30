import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// App dùng History API (/login, /customer, /staff, ...) nên cần SPA fallback.
// Vite dev server & preview đã bật mặc định. Khi deploy hãy rewrite mọi đường dẫn về index.html.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8080,
    strictPort: true,
  }, 
})   