import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // 與後端共用專案根目錄 .env（VITE_* 變數）
  envDir: path.resolve(__dirname, '..'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    // 允許你正式上線的網域，避免 Vite 開發伺服器擋掉外部 Host
    allowedHosts: [
      'hugging-chat-dashboard.azure.feis.cs.nthu.edu.tw',
    ],
    // 代理設定：解決本地開發時的前後端分離跨域問題
    proxy: {
      '/api': { 
        target: 'http://localhost:8000', 
        changeOrigin: true 
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: [
      'hugging-chat-dashboard.azure.feis.cs.nthu.edu.tw',
    ],
  },
})