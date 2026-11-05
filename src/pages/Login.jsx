import { useEffect, useState } from 'react'
import { rpc, errText } from '../api.js'
import { Ava, Logo, Icon } from '../ui.jsx'

export default function Login({ onLogin }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)
  const [pin, setPin] = useState('')
  const [first, setFirst] = useState('')   // PIN lần 1 khi tạo mới
  const [busy, setBusy] = useState(false)

  const fetchList = () => rpc('list_members_public').then(setList).catch((e) => setErr(errText(e)))
  useEffect(() => { fetchList() }, [])

  const creating = pick && !pick.has_pin
  const step = creating ? (first ? 'confirm' : 'create') : 'enter'

  async function submit(p = pin) {
    if (p.length < 4 || busy) return
    setErr('')
    if (step === 'create') { setFirst(p); setPin(''); return }
    if (step === 'confirm' && p !== first) { setErr('Hai lần nhập PIN không khớp. Nhập lại.'); setFirst(''); setPin(''); return }
    setBusy(true)
    try {
      const r = await rpc('member_login', { p_member: pick.id, p_pin: p })
      if (!r.ok) { setErr('PIN không đúng.'); setPin('') } else onLogin({ token: r.token, member_id: r.member_id, name: r.name })
    } catch (e) { setErr(errText(e)); setPin('') }
    finally { setBusy(false) }
  }
  const press = (d) => { setErr(''); setPin((p) => (p.length < 6 ? p + d : p)) }
  useEffect(() => {
    const k = (e) => {
      if (!pick) return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter') submit()
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  return (
    <div className="login">
      <div className="login-box">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <Logo size={72} />
          <h1 className="display" style={{ fontSize: 46, fontWeight: 800 }}>GYM <span className="neon">CHALLENGE</span></h1>
          <div className="display neon" style={{ letterSpacing: '.2em', fontWeight: 700 }}>TẬP ĐỀU – KHÔNG BỎ CUỘC</div>
        </div>

        {!pick ? (
          <>
            <div className="muted" style={{ textAlign: 'center' }}>Chọn tên của bạn</div>
            {!list && !err && <div className="spinner" />}
            {list && (
              <div className="who">
                {list.map((m) => (
                  <button key={m.id} onClick={() => !m.locked && setPick(m)} disabled={m.locked} style={m.locked ? { opacity: .45 } : null}>
                    <Ava m={m} /><span className="grow">{m.name}<div className="small dim" style={{ fontWeight: 500 }}>{m.locked ? 'Đã khóa' : m.has_pin ? 'Nhập PIN' : 'Tạo PIN lần đầu'}</div></span>
                  </button>
                ))}
              </div>
            )}
            {err && <div className="card" style={{ color: 'var(--red)' }}>{err} <button className="btn sm" onClick={fetchList}>Thử lại</button></div>}
          </>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Ava m={pick} size="lg" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 30 }}>{pick.name}</h2>
              <div className="muted">{step === 'create' ? 'Tạo PIN cá nhân (4–6 số)' : step === 'confirm' ? 'Nhập lại PIN để xác nhận' : 'Nhập PIN của bạn'}</div>
            </div>
            <div className="pin-dots" aria-label={`Đã nhập ${pin.length} số`}>
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
            </div>
            <div style={{ minHeight: 24, textAlign: 'center', color: 'var(--red)', fontWeight: 600 }} role="alert">{err}</div>
            <div className="pad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
              <button onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Xóa"><Icon n="left" style={{ width: 26 }} /></button>
              <button onClick={() => press('0')}>0</button>
              <button onClick={() => submit()} disabled={pin.length < 4 || busy} style={{ background: 'var(--neon)', color: '#04140a', fontSize: 20 }}>{busy ? '…' : 'OK'}</button>
            </div>
            <button className="btn ghost" onClick={() => { setPick(null); setPin(''); setFirst(''); setErr('') }}>← Chọn tên khác</button>
            {step !== 'enter' && <p className="small dim" style={{ textAlign: 'center' }}>Lần đầu đăng nhập: PIN bạn tạo sẽ dùng cho những lần sau. Quên PIN, nhờ Admin đặt lại.</p>}
          </>
        )}
      </div>
    </div>
  )
}
