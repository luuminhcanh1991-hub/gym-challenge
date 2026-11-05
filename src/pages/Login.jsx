import { useEffect, useState } from 'react'
import { rpc, errText } from '../api.js'
import { Ava, Icon, EMBLEM_LG } from '../ui.jsx'

const onlyDigits = (s) => s.replace(/\D/g, '').slice(0, 6)

export default function Login({ onLogin }) {
  const [list, setList] = useState(null)
  const [canJoin, setCanJoin] = useState(false)
  const [joinInfo, setJoinInfo] = useState(null)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState('pick')   // pick | pin | join | recover | code
  const [pick, setPick] = useState(null)
  const [pin, setPin] = useState('')
  const [first, setFirst] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)     // kết quả đăng nhập chờ hiện mã khôi phục

  const fetchList = () => {
    setErr('')
    rpc('list_members_public').then(setList).catch((e) => setErr(errText(e)))
    rpc('join_info').then((r) => { setCanJoin(!!r?.allow_self_join); setJoinInfo(r) }).catch(() => {})
  }
  useEffect(() => { fetchList() }, [])

  const finish = (r) => {
    const s = { token: r.token, member_id: r.member_id, name: r.name }
    if (r.recovery_code) { setDone({ s, code: r.recovery_code }); setMode('code') } else onLogin(s)
  }
  const back = () => { setMode('pick'); setPick(null); setPin(''); setFirst(''); setErr('') }

  if (mode === 'code') return <Shell><RecoveryCode code={done.code} onNext={() => onLogin(done.s)} /></Shell>
  if (mode === 'join') return <Shell><Join onBack={back} onDone={finish} info={joinInfo} /></Shell>
  if (mode === 'recover') return <Shell><Recover m={pick} onBack={() => { setMode('pin'); setErr('') }} onDone={finish} /></Shell>

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
      if (!r.ok) { setErr('PIN không đúng.'); setPin('') } else finish(r)
    } catch (e) { setErr(errText(e)); setPin('') }
    finally { setBusy(false) }
  }
  const press = (d) => { setErr(''); setPin((p) => (p.length < 6 ? p + d : p)) }

  return (
    <Shell>
      {mode === 'pick' ? (
        <>
          <div className="muted" style={{ textAlign: 'center' }}>Chọn tên của bạn</div>
          {!list && !err && <div className="spinner" />}
          {list && (
            <div className="who">
              {list.map((m) => (
                <button key={m.id} onClick={() => { if (!m.locked) { setPick(m); setMode('pin') } }} disabled={m.locked} style={m.locked ? { opacity: .45 } : null}>
                  <Ava m={m} /><span className="grow">{m.name}<div className="small dim" style={{ fontWeight: 500 }}>{m.locked ? 'Đã khóa' : m.has_pin ? 'Nhập PIN' : 'Tạo PIN lần đầu'}</div></span>
                </button>
              ))}
            </div>
          )}
          {err && <div className="card" style={{ color: 'var(--red)' }}>{err} <button className="btn sm" onClick={fetchList}>Thử lại</button></div>}
          {canJoin && (
            <button className="btn block" onClick={() => setMode('join')}><Icon n="plus" width="20" />Thành viên mới? Tham gia nhóm</button>
          )}
        </>
      ) : (
        <PinPad
          m={pick} pin={pin} err={err} busy={busy}
          title={step === 'create' ? 'Tạo PIN cá nhân (4–6 số)' : step === 'confirm' ? 'Nhập lại PIN để xác nhận' : 'Nhập PIN của bạn'}
          press={press} del={() => setPin((p) => p.slice(0, -1))} submit={() => submit()}
          footer={<>
            {step === 'enter' && <button className="btn ghost" onClick={() => { setMode('recover'); setErr('') }}>Quên PIN?</button>}
            <button className="btn ghost" onClick={back}>← Chọn tên khác</button>
            {step !== 'enter' && <p className="small dim" style={{ textAlign: 'center', margin: 0 }}>Lần đầu đăng nhập: PIN bạn tạo sẽ dùng cho những lần sau.</p>}
          </>}
        />
      )}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="login">
      <div className="login-box">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', gap: 10 }}>
          <img className="emblem" src={EMBLEM_LG} alt="LIFEBALANCE – Work hard. Live fully." />
          <h1 className="display" style={{ fontSize: 44, fontWeight: 800, marginTop: 8 }}>GYM <span className="neon">CHALLENGE</span></h1>
          <div className="display" style={{ letterSpacing: '.22em', fontWeight: 700, color: 'var(--gold)' }}>TẬP ĐỀU – KHÔNG BỎ CUỘC</div>
        </div>
        {children}
      </div>
    </div>
  )
}

function PinPad({ m, pin, err, busy, title, press, del, submit, footer }) {
  useEffect(() => {
    const k = (e) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') del()
      else if (e.key === 'Enter') submit()
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })
  return (
    <>
      <div className="row" style={{ justifyContent: 'center' }}><Ava m={m} size="lg" /></div>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 30 }}>{m.name}</h2>
        <div className="muted">{title}</div>
      </div>
      <div className="pin-dots" aria-label={`Đã nhập ${pin.length} số`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
      </div>
      <div style={{ minHeight: 24, textAlign: 'center', color: 'var(--red)', fontWeight: 600 }} role="alert">{err}</div>
      <div className="pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => press(d)}>{d}</button>)}
        <button onClick={del} aria-label="Xóa"><Icon n="left" style={{ width: 26 }} /></button>
        <button onClick={() => press('0')}>0</button>
        <button onClick={submit} disabled={pin.length < 4 || busy} style={{ background: 'var(--neon)', color: '#04140a', fontSize: 20 }}>{busy ? '…' : 'OK'}</button>
      </div>
      {footer}
    </>
  )
}

function Join({ onBack, onDone, info }) {
  const [code, setCode] = useState(''); const [name, setName] = useState('')
  const [p1, setP1] = useState(''); const [p2, setP2] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault(); setErr('')
    if (name.trim().length < 2) return setErr('Nhập tên hiển thị (ít nhất 2 ký tự).')
    if (p1.length < 4) return setErr('PIN gồm 4–6 chữ số.')
    if (p1 !== p2) return setErr('Hai lần nhập PIN không khớp.')
    setBusy(true)
    try {
      const r = await rpc('member_join', { p_code: code, p_name: name, p_pin: p1 })
      if (!r.ok) setErr('Mã mời không đúng. Hỏi Admin để lấy mã.'); else onDone(r)
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }
  return (
    <form className="card stack" onSubmit={go}>
      <h2 className="display" style={{ fontSize: 28 }}>Tham gia nhóm</h2>
      <div className="field"><label htmlFor="jc">Mã mời của nhóm</label><input id="jc" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="Hỏi Admin để lấy mã" required /></div>
      <div className="field"><label htmlFor="jn">Tên hiển thị</label><input id="jn" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ví dụ: Em Minh" required /></div>
      <div className="grid g2">
        <div className="field"><label htmlFor="jp">PIN (4–6 số)</label><input id="jp" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={p1} onChange={(e) => setP1(onlyDigits(e.target.value))} required /></div>
        <div className="field"><label htmlFor="jp2">Nhập lại PIN</label><input id="jp2" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={p2} onChange={(e) => setP2(onlyDigits(e.target.value))} required /></div>
      </div>
      {err && <div style={{ color: 'var(--red)', fontWeight: 600 }} role="alert">{err}</div>}
      <button className="btn primary block" disabled={busy}>{busy ? 'Đang tạo…' : 'Tham gia'}</button>
      <p className="small dim" style={{ margin: 0 }}>Phạt chỉ tính từ ngày bạn tham gia.{info?.monthly_fee > 0 && <> Phí tháng này của bạn: <b style={{ color: 'var(--gold)' }}>{(info.fee_if_join_today || 0).toLocaleString('vi-VN')}đ</b> ({info.days_left}/{info.month_days} ngày bắt buộc còn lại, thay vì {info.monthly_fee.toLocaleString('vi-VN')}đ cả tháng).</>}</p>
      <button type="button" className="btn ghost" onClick={onBack}>← Quay lại</button>
    </form>
  )
}

function Recover({ m, onBack, onDone }) {
  const [code, setCode] = useState(''); const [p1, setP1] = useState(''); const [p2, setP2] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault(); setErr('')
    if (p1.length < 4) return setErr('PIN gồm 4–6 chữ số.')
    if (p1 !== p2) return setErr('Hai lần nhập PIN không khớp.')
    setBusy(true)
    try {
      const r = await rpc('member_recover_pin', { p_member: m.id, p_code: code, p_new_pin: p1 })
      if (!r.ok) setErr('Mã khôi phục không đúng.'); else onDone(r)
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }
  return (
    <form className="card stack" onSubmit={go}>
      <div className="row"><Ava m={m} /><div><h2 className="display" style={{ fontSize: 26 }}>Quên PIN</h2><div className="small muted">{m.name}</div></div></div>
      {m.has_recovery ? (
        <>
          <div className="field"><label htmlFor="rc">Mã khôi phục (dạng XXXX-XXXX)</label><input id="rc" className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="ABCD-EFGH" required /></div>
          <div className="grid g2">
            <div className="field"><label htmlFor="rp">PIN mới</label><input id="rp" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={p1} onChange={(e) => setP1(onlyDigits(e.target.value))} required /></div>
            <div className="field"><label htmlFor="rp2">Nhập lại PIN mới</label><input id="rp2" className="input" type="password" inputMode="numeric" autoComplete="new-password" value={p2} onChange={(e) => setP2(onlyDigits(e.target.value))} required /></div>
          </div>
          {err && <div style={{ color: 'var(--red)', fontWeight: 600 }} role="alert">{err}</div>}
          <button className="btn primary block" disabled={busy}>{busy ? 'Đang xử lý…' : 'Đặt PIN mới'}</button>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Tài khoản này chưa có mã khôi phục. Nhờ Admin bấm <b>Đặt lại PIN</b> cho bạn, sau đó tạo PIN mới ở lần đăng nhập tới.</p>
      )}
      <p className="small dim" style={{ margin: 0 }}>Không còn mã khôi phục? Admin có thể đặt lại PIN cho bạn trong trang quản trị.</p>
      <button type="button" className="btn ghost" onClick={onBack}>← Quay lại</button>
    </form>
  )
}

export function RecoveryCode({ code, onNext, nextLabel = 'Tôi đã lưu mã, tiếp tục' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true) } catch {} }
  return (
    <div className="card stack" style={{ textAlign: 'center' }}>
      <h2 className="display" style={{ fontSize: 28 }}>Mã khôi phục PIN</h2>
      <p className="muted" style={{ margin: 0 }}>Dùng mã này để tự đặt lại PIN khi quên. Mã <b>chỉ hiện một lần</b>. Hãy chụp màn hình hoặc lưu vào ghi chú.</p>
      <div className="display neon" style={{ fontSize: 'clamp(30px, 10vw, 44px)', fontWeight: 800, letterSpacing: '.1em', padding: '10px 0', userSelect: 'all', whiteSpace: 'nowrap' }}>{code}</div>
      <button className="btn" onClick={copy}>{copied ? 'Đã copy' : 'Copy mã'}</button>
      <button className="btn primary block" onClick={onNext}>{nextLabel}</button>
    </div>
  )
}
