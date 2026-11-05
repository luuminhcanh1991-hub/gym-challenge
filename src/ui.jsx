import { useEffect, useState } from 'react'
import { initials } from './util.js'

const P = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  cal: 'M4 6.5h16v13H4zM4 10.5h16M8.5 3.5v5M15.5 3.5v5',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3.5 3.5 0 0 0 4 4M16 6h3.5a3.5 3.5 0 0 1-4 4M12 13v4M8.5 20h7M10 17h4',
  wallet: 'M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5h12M16 13.5h.01',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  report: 'M6 3.5h9l3.5 3.5v13.5H6zM14.5 3.5V7.5h4M9 12h6M9 15.5h6M9 8.5h2',
  shield: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z',
  flame: 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.6 3.8-8.8.9 1.7 1.6 2.6 2.9 3.4.3-2.3 1.3-4.3 3-6.4.8 3.7 4.3 6.4 4.3 11.2 0 3.9-3 6.8-7.5 6.8z',
  x: 'M6 6l12 12M18 6 6 18',
  left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
  briefcase: 'M3.5 8h17v11h-17zM9 8V5.5h6V8M3.5 13h17',
  homeTown: 'M3 20h18M5 20V10l5-4 5 4v10M15 20v-6h4v6M8.5 14h3v6h-3z',
  sick: 'M12 4v16M4 12h16M7.5 7.5h9v9h-9z',
  pen: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  lock: 'M6 10.5h12V20H6zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 19.5h14',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  medal: 'M8 3l4 6 4-6M12 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 12.5v3.5',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z',
  alert: 'M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01',
  coffee: 'M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11.5 3.5v2.5',
  plus: 'M12 5v14M5 12h14',
}
export function Icon({ n, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[n]} />
    </svg>
  )
}

export function Logo({ size = 34 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0f1411" />
      <rect x="1" y="1" width="62" height="62" rx="15" fill="none" stroke="#3dff7a" strokeOpacity=".35" strokeWidth="2" />
      <rect x="10" y="24" width="6" height="16" rx="2" fill="#3dff7a" />
      <rect x="48" y="24" width="6" height="16" rx="2" fill="#3dff7a" />
      <rect x="16" y="20" width="6" height="24" rx="2" fill="#3dff7a" />
      <rect x="42" y="20" width="6" height="24" rx="2" fill="#3dff7a" />
      <path d="M22 32h20" stroke="#f5f7f6" strokeWidth="4" strokeLinecap="round" />
      <path d="M35 14 27 33h6l-3 17 9-21h-6z" fill="#f5f7f6" />
    </svg>
  )
}

export function Brand() {
  return (
    <a className="brand" href="#/">
      <Logo />
      <span className="brand-name">GYM <b>CHALLENGE</b></span>
    </a>
  )
}

export function Ava({ m, size = '' }) {
  return <div className={'ava ' + size} style={{ background: m.color }} aria-hidden="true">{initials(m.name)}</div>
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng"><Icon n="x" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

let toastFn = null
export const toast = (msg, err = false) => toastFn && toastFn({ msg, err, id: Date.now() })
export function Toaster() {
  const [t, setT] = useState(null)
  useEffect(() => { toastFn = setT; return () => { toastFn = null } }, [])
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), t.err ? 4200 : 2600); return () => clearTimeout(h) }, [t])
  return t ? <div className={'toast' + (t.err ? ' err' : '')} role="status">{t.msg}</div> : null
}

export function celebrate(text = 'Tuyệt vời!') {
  const root = document.createElement('div')
  root.className = 'confetti'
  const colors = ['#3dff7a', '#f5f7f6', '#ffd23f', '#4da3ff', '#1fcf5a']
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i')
    p.style.left = Math.random() * 100 + 'vw'
    p.style.background = colors[i % colors.length]
    p.style.animationDuration = 1.6 + Math.random() * 1.8 + 's'
    p.style.animationDelay = Math.random() * 0.4 + 's'
    p.style.transform = `rotate(${Math.random() * 360}deg)`
    root.appendChild(p)
  }
  const msg = document.createElement('div')
  msg.className = 'celebrate'
  const inner = document.createElement('div')
  inner.textContent = text
  msg.appendChild(inner)
  document.body.append(root, msg)
  if (navigator.vibrate) navigator.vibrate([30, 40, 60])
  setTimeout(() => { root.remove(); msg.remove() }, 3800)
}

export function Busy({ on, children, ...p }) {
  return <button {...p} disabled={on || p.disabled}>{on ? 'Đang xử lý…' : children}</button>
}
