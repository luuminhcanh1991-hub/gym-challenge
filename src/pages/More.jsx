import { useState } from 'react'
import { rpc, errText } from '../api.js'
import { Ava, Icon, Sheet, toast } from '../ui.jsx'

export default function More({ me, token, logout, state }) {
  const [pinOpen, setPinOpen] = useState(false)
  const [o, setO] = useState(''); const [n, setN] = useState(''); const [busy, setBusy] = useState(false)
  const links = [
    ['members', 'users', 'Thành viên'], ['finance', 'wallet', 'Tài chính & ví'], ['report', 'report', 'Báo cáo tháng'],
    ['calendar', 'cal', 'Lịch tập'], ['ranking', 'trophy', 'Bảng xếp hạng'],
  ]
  async function change() {
    setBusy(true)
    try { await rpc('member_change_pin', { p_token: token, p_old: o, p_new: n }); toast('Đã đổi PIN.'); setPinOpen(false); setO(''); setN('') }
    catch (e) { toast(errText(e), true) } finally { setBusy(false) }
  }
  return (
    <>
      <div className="card row" style={{ marginTop: 4 }}>
        <Ava m={me} size="lg" />
        <div className="grow"><h2 style={{ fontSize: 28 }}>{me.name}</h2><div className="small muted">{me.sessions_total} buổi tập · chuỗi {me.streak} ngày</div></div>
      </div>
      <div className="card section list" style={{ marginTop: 12, paddingTop: 4, paddingBottom: 4 }}>
        {links.map(([r, i, t]) => (
          <a key={r} href={'#/' + r} className="li" style={{ color: 'inherit', textDecoration: 'none' }}><Icon n={i} width="22" /><b className="grow">{t}</b><Icon n="right" width="18" /></a>
        ))}
      </div>
      <div className="stack section" style={{ marginTop: 12 }}>
        <button className="btn block" onClick={() => setPinOpen(true)}><Icon n="lock" width="18" />Đổi PIN</button>
        <button className="btn danger block" onClick={logout}><Icon n="logout" width="18" />Đăng xuất</button>
      </div>
      <p className="small dim" style={{ marginTop: 20 }}>
        Cài như ứng dụng: trên iPhone mở bằng Safari → Chia sẻ → “Thêm vào MH chính”. Trên Android: Chrome → ⋮ → “Cài đặt ứng dụng”.
      </p>
      {pinOpen && (
        <Sheet title="Đổi PIN" onClose={() => setPinOpen(false)}>
          <div className="stack">
            <div className="field"><label htmlFor="op">PIN hiện tại</label><input id="op" className="input" inputMode="numeric" type="password" maxLength={6} value={o} onChange={(e) => setO(e.target.value.replace(/\D/g, ''))} /></div>
            <div className="field"><label htmlFor="np">PIN mới (4–6 số)</label><input id="np" className="input" inputMode="numeric" type="password" maxLength={6} value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ''))} /></div>
            <button className="btn primary block" disabled={busy || o.length < 4 || n.length < 4} onClick={change}>Lưu PIN mới</button>
          </div>
        </Sheet>
      )}
    </>
  )
}
