import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<App />)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}))
}

// Tự tải lại khi có bản mới (kiểm tra khi mở lại app và mỗi 5 phút)
if (import.meta.env.PROD) {
  const check = () => fetch(import.meta.env.BASE_URL + 'version.json?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => r.json()).then((v) => { if (v.id && v.id !== __BUILD_ID__) window.location.reload() }).catch(() => {})
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  setInterval(check, 5 * 60 * 1000)
}
