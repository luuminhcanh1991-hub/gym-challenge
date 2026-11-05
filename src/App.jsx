import { useCallback, useEffect, useRef, useState } from 'react'
import { configured, rpc, session, errText, RECOVERY } from './api.js'
import { Brand, Icon, Toaster, toast } from './ui.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CheckIn from './pages/CheckIn.jsx'
import Members from './pages/Members.jsx'
import Calendar from './pages/Calendar.jsx'
import Ranking from './pages/Ranking.jsx'
import Finance from './pages/Finance.jsx'
import Report from './pages/Report.jsx'
import More from './pages/More.jsx'
import Admin from './pages/Admin.jsx'

function useRoute() {
  const get = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] || '')
  const [r, setR] = useState(get)
  useEffect(() => {
    const f = () => { setR(get()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return r
}

const NAV = [
  { r: '', n: 'home', t: 'Trang chủ' },
  { r: 'calendar', n: 'cal', t: 'Lịch' },
  { r: 'checkin', n: 'bolt', t: 'Check-in' },
  { r: 'ranking', n: 'trophy', t: 'Xếp hạng' },
  { r: 'more', n: 'menu', t: 'Thêm' },
]
const SIDE = [
  { r: '', n: 'home', t: 'Trang chủ' }, { r: 'checkin', n: 'bolt', t: 'Check-in' }, { r: 'members', n: 'users', t: 'Thành viên' },
  { r: 'calendar', n: 'cal', t: 'Lịch tập' }, { r: 'ranking', n: 'trophy', t: 'Bảng xếp hạng' }, { r: 'finance', n: 'wallet', t: 'Tài chính' },
  { r: 'report', n: 'report', t: 'Báo cáo tháng' }, { r: 'more', n: 'menu', t: 'Tài khoản' },
]

export default function App() {
  const route = useRoute()
  if (!configured) return <Setup />
  if (RECOVERY || route.startsWith('admin')) return <><Admin /><Toaster /></>
  return <><MemberApp route={route} /><Toaster /></>
}

function MemberApp({ route }) {
  const [sess, setSess] = useState(session.get)
  const [state, setState] = useState(null)
  const [month, setMonth] = useState(null)
  const [loadErr, setLoadErr] = useState(null)
  const busy = useRef(false)

  const load = useCallback(async (m = month) => {
    if (!sess || busy.current) return
    busy.current = true
    try {
      const s = await rpc('app_state', { p_token: sess.token, p_month: m })
      setState(s); setLoadErr(null)
    } catch (e) {
      if (String(e.message).includes('AUTH_REQUIRED')) { session.clear(); setSess(null); setState(null); toast(errText(e), true) }
      else setLoadErr(errText(e))
    } finally { busy.current = false }
  }, [sess, month])

  useEffect(() => { load() }, [load])
  // Đồng bộ giữa các thiết bị: làm mới định kỳ + khi quay lại ứng dụng
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 20000)
    const v = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', v); window.addEventListener('focus', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v); window.removeEventListener('focus', v) }
  }, [load])

  if (!sess) return <Login onLogin={(s) => { session.set(s); window.location.hash = '#/'; setSess(s) }} />
  if (!state) return <div className="login">{loadErr ? <div className="card stack" style={{ maxWidth: 420 }}><b>Không tải được dữ liệu</b><span className="muted">{loadErr}</span><button className="btn primary" onClick={() => load()}>Thử lại</button></div> : <div className="spinner" />}</div>

  const me = state.members.find((m) => m.id === state.me)
  const logout = async () => { try { await rpc('member_logout', { p_token: sess.token }) } catch {} session.clear(); setSess(null); setState(null) }
  const ctx = { state, me, token: sess.token, reload: load, month: month || state.month, setMonth: (m) => { setMonth(m); load(m) }, logout }
  const todayDone = me?.today?.status === 'trained'

  let page
  switch (route) {
    case 'checkin': page = <CheckIn {...ctx} />; break
    case 'members': page = <Members {...ctx} />; break
    case 'calendar': page = <Calendar {...ctx} />; break
    case 'ranking': page = <Ranking {...ctx} />; break
    case 'finance': page = <Finance {...ctx} />; break
    case 'report': page = <Report {...ctx} />; break
    case 'more': page = <More {...ctx} />; break
    default: page = <Dashboard {...ctx} />
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        {SIDE.map((x) => (
          <a key={x.r} href={'#/' + x.r} className={'side-link' + (route === x.r ? ' on' : '')}><Icon n={x.n} />{x.t}</a>
        ))}
        <div className="side-foot card pad-s row">
          <div className="grow"><div className="small muted">Đang đăng nhập</div><b>{me?.name}</b></div>
          <button className="icon-btn" onClick={logout} aria-label="Đăng xuất"><Icon n="logout" /></button>
        </div>
      </aside>
      <div>
        <header className="topbar only-m">
          <Brand />
          <a href="#/more" className="row" style={{ textDecoration: 'none', color: 'inherit', gap: 8 }} aria-label="Tài khoản">
            <span className="small muted">{me?.name}</span>
          </a>
        </header>
        <main className="main">{page}</main>
      </div>
      <nav className="tabbar" aria-label="Điều hướng">
        {NAV.map((x) => x.r === 'checkin' ? (
          <a key={x.r} href="#/checkin" className={'tab cta' + (todayDone ? ' done' : '') + (route === x.r ? ' on' : '')} aria-label="Check-in">
            <span className="cta-dot"><Icon n={todayDone ? 'check' : 'bolt'} /></span>
          </a>
        ) : (
          <a key={x.r} href={'#/' + x.r} className={'tab' + (route === x.r ? ' on' : '')}><Icon n={x.n} />{x.t}</a>
        ))}
      </nav>
    </div>
  )
}

function Setup() {
  return (
    <div className="login"><div className="login-box card">
      <Brand />
      <h2>Chưa cấu hình database</h2>
      <p className="muted">Thiếu biến <code>VITE_SUPABASE_URL</code> và <code>VITE_SUPABASE_ANON_KEY</code>. Thêm vào GitHub → Settings → Secrets and variables → Actions → Variables, rồi chạy lại workflow Deploy.</p>
    </div></div>
  )
}
