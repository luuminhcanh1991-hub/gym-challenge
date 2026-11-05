import { useCallback, useEffect, useState } from 'react'
import { supabase, adminRpc as rpc, errText, RECOVERY } from '../api.js'
import { Ava, Brand, Icon, Sheet, toast, askConfirm, askText } from '../ui.jsx'
import { TxList } from './Finance.jsx'
import { MonthNav } from './Calendar.jsx'
import { ReportView, exportExcel } from './Report.jsx'
import { vnd, WEEKDAYS, WEEKDAY_FULL, dateTimeVN, ddmmyyyy, dayStatus, STATUS_LABEL, shiftMonth, addDays } from '../util.js'

const COLORS = ['#3dff7a', '#00e5ff', '#ffd23f', '#ff6b6b', '#b388ff', '#ff9f43', '#f5f7f6', '#4da3ff']

export default function Admin() {
  const [user, setUser] = useState(undefined)
  const [recovery, setRecovery] = useState(RECOVERY)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === 'PASSWORD_RECOVERY') setRecovery(true); setUser(s?.user || null) })
    return () => data.subscription.unsubscribe()
  }, [])
  if (user === undefined) return <div className="login"><div className="spinner" /></div>
  if (recovery) return <SetNewPassword user={user} onDone={() => { setRecovery(false); window.history.replaceState(null, '', window.location.pathname + '#/admin') }} />
  if (!user) return <AdminLogin />
  return <AdminApp user={user} />
}

function SetNewPassword({ user, onDone }) {
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  if (!user) return (
    <div className="login"><div className="login-box card stack">
      <Brand />
      <b>Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn</b>
      <span className="muted small">Link chỉ dùng được 1 lần và có hạn ngắn. Hãy yêu cầu link mới.</span>
      <button className="btn primary" onClick={onDone}>Về trang đăng nhập Admin</button>
    </div></div>
  )
  async function go(e) {
    e.preventDefault(); setErr('')
    if (p1.length < 8) return setErr('Mật khẩu tối thiểu 8 ký tự.')
    if (p1 !== p2) return setErr('Hai lần nhập không khớp.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: p1 })
    setBusy(false)
    if (error) return setErr(errText(error))
    toast('Đã đặt mật khẩu mới.'); onDone()
  }
  return (
    <div className="login">
      <form className="login-box card" onSubmit={go}>
        <Brand />
        <div><h1 className="display" style={{ fontSize: 34 }}>Đặt mật khẩu mới</h1><div className="muted small">{user.email}</div></div>
        <div className="field"><label htmlFor="np1">Mật khẩu mới (tối thiểu 8 ký tự)</label><input id="np1" className="input" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required /></div>
        <div className="field"><label htmlFor="np2">Nhập lại mật khẩu mới</label><input id="np2" className="input" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required /></div>
        {err && <div style={{ color: 'var(--red)', fontWeight: 600 }} role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu mật khẩu'}</button>
      </form>
    </div>
  )
}

function AdminLogin() {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const [forgot, setForgot] = useState(false); const [sent, setSent] = useState(false)
  async function go(e) {
    e.preventDefault(); setBusy(true); setErr('')
    if (forgot) {
      const redirectTo = window.location.origin + window.location.pathname + '?reset=1'
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) setErr(errText(error)); else setSent(true)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
      if (error) setErr(errText(error))
    }
    setBusy(false)
  }
  if (forgot) return (
    <div className="login">
      <form className="login-box card" onSubmit={go}>
        <Brand />
        <div><h1 className="display" style={{ fontSize: 34 }}>Quên mật khẩu</h1><div className="muted small">Nhập email Admin, hệ thống gửi link đặt lại mật khẩu.</div></div>
        {sent ? (
          <div className="stack">
            <div className="card pad-s" style={{ borderColor: 'rgba(61,255,122,.4)' }}>Đã gửi. Mở email <b>{email}</b>, bấm link trong thư (kiểm tra cả mục Spam). Link dùng 1 lần.</div>
          </div>
        ) : (
          <>
            <div className="field"><label htmlFor="fe">Email</label><input id="fe" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            {err && <div style={{ color: 'var(--red)', fontWeight: 600 }} role="alert">{err}</div>}
            <button className="btn primary block" disabled={busy}>{busy ? 'Đang gửi…' : 'Gửi link đặt lại'}</button>
          </>
        )}
        <button type="button" className="btn ghost" onClick={() => { setForgot(false); setSent(false); setErr('') }}>← Quay lại đăng nhập</button>
      </form>
    </div>
  )
  return (
    <div className="login">
      <form className="login-box card" onSubmit={go}>
        <Brand />
        <div><h1 className="display" style={{ fontSize: 38 }}>Quản trị</h1><div className="muted small">Đăng nhập bằng tài khoản Admin Supabase.</div></div>
        <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pw">Mật khẩu</label><input id="pw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
        {err && <div style={{ color: 'var(--red)', fontWeight: 600 }} role="alert">{err}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        <button type="button" className="btn ghost" onClick={() => { setForgot(true); setErr('') }}>Quên mật khẩu?</button>
        <a href="#/" className="small muted">← Về ứng dụng thành viên</a>
      </form>
    </div>
  )
}

const TABS = [['home', 'Tổng quan'], ['members', 'Thành viên'], ['money', 'Ví & Quỹ'], ['days', 'Điều chỉnh ngày'], ['settings', 'Cài đặt'], ['report', 'Báo cáo & chốt'], ['audit', 'Nhật ký'], ['backup', 'Sao lưu']]

function AdminApp({ user }) {
  const [state, setState] = useState(null)
  const [month, setMonth] = useState(null)
  const [tab, setTab] = useState('home')
  const [err, setErr] = useState('')
  const load = useCallback(async (m = month) => {
    try { setState(await rpc('app_state', { p_token: null, p_month: m })); setErr('') } catch (e) { setErr(errText(e)) }
  }, [month])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(() => document.visibilityState === 'visible' && load(), 30000); return () => clearInterval(t) }, [load])
  const logout = () => supabase.auth.signOut()

  if (err && !state) return (
    <div className="login"><div className="login-box card stack">
      <b>Không vào được trang quản trị</b><span className="muted">{err}</span>
      {err.includes('Phiên') && <span className="small muted">Tài khoản {user.email} chưa được cấp quyền Admin. Chạy <code>select public.bootstrap_admin('{user.email}');</code> trong Supabase SQL Editor.</span>}
      <button className="btn" onClick={logout}>Đăng xuất</button>
    </div></div>
  )
  if (!state) return <div className="login"><div className="spinner" /></div>
  if (!state.is_admin) return (
    <div className="login"><div className="login-box card stack">
      <b>Tài khoản chưa có quyền Admin</b>
      <span className="small muted">Chạy trong Supabase SQL Editor: <code>select public.bootstrap_admin('{user.email}');</code></span>
      <button className="btn" onClick={logout}>Đăng xuất</button>
    </div></div>
  )
  const ctx = { state, reload: load, month: month || state.month, setMonth: (m) => { setMonth(m); load(m) } }
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header className="topbar" style={{ position: 'sticky' }}>
        <Brand />
        <div className="row" style={{ gap: 8 }}>
          <span className="pill admin no-dot">ADMIN</span>
          <button className="icon-btn" onClick={logout} aria-label="Đăng xuất"><Icon n="logout" /></button>
        </div>
      </header>
      <main className="main" style={{ paddingBottom: 48 }}>
        <div className="admin-tabs" role="tablist">
          {TABS.map(([k, v]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}
        </div>
        {tab === 'home' && <AHome {...ctx} />}
        {tab === 'members' && <AMembers {...ctx} />}
        {tab === 'money' && <AMoney {...ctx} />}
        {tab === 'days' && <ADays {...ctx} />}
        {tab === 'settings' && <ASettings {...ctx} />}
        {tab === 'report' && <AReport {...ctx} />}
        {tab === 'audit' && <AAudit />}
        {tab === 'backup' && <ABackup />}
      </main>
    </div>
  )
}

const call = async (fn, args, ok, reload) => {
  try { await rpc(fn, args); if (ok) toast(ok); reload && (await reload()); return true } catch (e) { toast(errText(e), true); return false }
}

function AHome({ state, reload }) {
  const pending = state.wallet_tx.filter((t) => t.status === 'pending')
  const f = state.fund
  return (
    <>
      <div className="grid g4">
        <div className="card stat hi"><div className="k">Quỹ chung</div><div className="v">{vnd(f.balance)}</div></div>
        <div className="card stat"><div className="k">Còn thiếu (ký quỹ + phạt)</div><div className="v" style={{ color: (f.penalty_uncollected + (f.fee_uncollected || 0)) ? 'var(--red)' : undefined }}>{vnd(f.penalty_uncollected + (f.fee_uncollected || 0))}</div></div>
        <div className="card stat"><div className="k">Nạp chờ duyệt</div><div className="v">{pending.length}</div></div>
        <div className="card stat"><div className="k">Đã tập hôm nay</div><div className="v">{state.members.filter((m) => m.today?.status === 'trained').length}<small>/{state.members.length}</small></div></div>
      </div>
      <div className="card section">
        <h3 className="display" style={{ fontSize: 22 }}>Yêu cầu nạp tiền chờ xác nhận</h3>
        {pending.length === 0 ? <div className="empty small">Không có yêu cầu nào.</div> : (
          <div className="list">
            {pending.map((t) => {
              const m = state.members.find((x) => x.id === t.member_id)
              return (
                <div className="li" key={t.id} style={{ flexWrap: 'wrap' }}>
                  {m && <Ava m={m} size="sm" />}
                  <div className="grow"><b>{m?.name}</b> <span className="amt plus" style={{ fontSize: 18 }}>{vnd(t.amount)}</span><div className="small dim">{dateTimeVN(t.created_at)}{t.note ? ' · ' + t.note : ''}</div></div>
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn sm danger" onClick={async () => (await askConfirm('Từ chối yêu cầu này?')) && call('admin_decide_deposit', { p_id: t.id, p_approve: false, p_note: null }, 'Đã từ chối.', reload)}>Từ chối</button>
                    <button className="btn sm primary" onClick={async () => (await askConfirm(`Xác nhận đã nhận ${vnd(t.amount)} từ ${m?.name}?`)) && call('admin_decide_deposit', { p_id: t.id, p_approve: true, p_note: null }, 'Đã xác nhận, tiền đã vào ví.', reload)}>Đã nhận tiền</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function AMembers({ state, reload }) {
  const [edit, setEdit] = useState(null)
  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <h2 className="display" style={{ fontSize: 26 }}>Thành viên ({state.members.length})</h2>
        <button className="btn primary sm" onClick={() => setEdit({ name: '', color: COLORS[state.members.length % COLORS.length], joined: state.today })}><Icon n="plus" width="18" />Thêm</button>
      </div>
      <div className="card list">
        {state.members.map((m) => (
          <div className="li" key={m.id} style={{ flexWrap: 'wrap' }}>
            <Ava m={m} />
            <div className="grow"><b>{m.name}</b>{m.locked && <span className="pill penalty no-dot" style={{ marginLeft: 8 }}>Đã khóa</span>}
              <div className="small dim">Tham gia {ddmmyyyy(m.joined_on)} · {m.has_pin ? 'Đã có PIN' : 'Chưa tạo PIN'} · ví {vnd(m.balance)}{m.outstanding > 0 ? ` · nợ ${vnd(m.outstanding)}` : ''}
                {state.settings.monthly_fee > 0 && (m.fee_month
                  ? ` · ký quỹ ${m.fee_month.status === 'voided' ? 'được miễn' : vnd(m.fee_preview?.amount || 0) + ` (${m.fee_month.member_days}/${m.fee_month.month_days} ngày)` + (m.fee_month.paid >= m.fee_month.amount ? ' đủ' : ` thiếu ${vnd(m.fee_month.amount - m.fee_month.paid)}`)}`
                  : m.fee_preview?.amount ? ` · ký quỹ dự kiến ${vnd(m.fee_preview.amount)} (${m.fee_preview.member_days}/${m.fee_preview.month_days} ngày, từ ${ddmmyyyy(m.joined_on)})` : '')}</div></div>
            <button className="btn sm" onClick={() => setEdit({ ...m })}>Sửa</button>
          </div>
        ))}
      </div>
      {edit && (
        <Sheet title={edit.id ? 'Sửa thành viên' : 'Thêm thành viên'} onClose={() => setEdit(null)}>
          <div className="stack">
            <div className="field"><label htmlFor="mn">Tên</label><input id="mn" className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={40} /></div>
            <div className="field"><label>Màu avatar</label>
              <div className="row wrap" style={{ gap: 8 }}>{COLORS.map((c) => <button key={c} onClick={() => setEdit({ ...edit, color: c })} aria-label={'Màu ' + c} style={{ width: 44, height: 44, borderRadius: '50%', background: c, border: edit.color === c ? '3px solid #fff' : '3px solid transparent' }} />)}</div>
            </div>
            {!edit.id && <div className="field"><label htmlFor="jd">Ngày bắt đầu tính (không phạt trước ngày này)</label><input id="jd" type="date" className="input" value={edit.joined} onChange={(e) => setEdit({ ...edit, joined: e.target.value })} /></div>}
            {edit.id ? (
              <>
                <button className="btn primary block" onClick={async () => (await call('admin_update_member', { p_id: edit.id, p_name: edit.name, p_color: edit.color, p_locked: null }, 'Đã lưu.', reload)) && setEdit(null)}>Lưu</button>
                <div className="grid g2">
                  <button className="btn" onClick={async () => (await askConfirm('Đặt lại PIN? Thành viên sẽ tự tạo PIN mới ở lần đăng nhập tới.')) && (await call('admin_reset_pin', { p_id: edit.id }, 'Đã đặt lại PIN.', reload)) && setEdit(null)}><Icon n="lock" width="18" />Đặt lại PIN</button>
                  <button className="btn" onClick={async () => (await call('admin_update_member', { p_id: edit.id, p_name: null, p_color: null, p_locked: !edit.locked }, edit.locked ? 'Đã mở khóa.' : 'Đã khóa (tạm dừng, không bị phạt).', reload)) && setEdit(null)}>{edit.locked ? 'Mở khóa' : 'Khóa tài khoản'}</button>
                </div>
                {edit.fee_month && edit.fee_month.status === 'active' && (
                  <button className="btn block" onClick={async () => { const note = await askText('Lý do miễn ký quỹ tháng này cho ' + edit.name, 'Ví dụ: thành viên mới, nhóm miễn'); if (note && (await call('admin_void_due', { p_member: edit.id, p_month: state.today.slice(0, 8) + '01', p_note: note }, 'Đã miễn ký quỹ tháng này.', reload))) setEdit(null) }}>Miễn ký quỹ tháng này</button>
                )}
                <button className="btn danger block" onClick={async () => (await askConfirm(`Xóa ${edit.name}? Lịch sử tài chính vẫn được giữ.`)) && (await call('admin_delete_member', { p_id: edit.id }, 'Đã xóa.', reload)) && setEdit(null)}>Xóa thành viên</button>
              </>
            ) : (
              <button className="btn primary block" onClick={async () => (await call('admin_add_member', { p_name: edit.name, p_color: edit.color, p_joined: edit.joined }, 'Đã thêm thành viên.', reload)) && setEdit(null)}>Thêm thành viên</button>
            )}
          </div>
        </Sheet>
      )}
    </>
  )
}

function AMoney({ state, reload }) {
  const [w, setW] = useState({ member: state.members[0]?.id, type: 'deposit', amount: '', note: '' })
  const [f, setF] = useState({ type: 'contribution', amount: '', note: '' })
  const num = (s) => Number(String(s).replace(/[^\d-]/g, ''))
  return (
    <>
      <div className="grid gm2">
        <div className="card stack">
          <h3 className="display" style={{ fontSize: 22 }}>Ghi nhận vào ví thành viên</h3>
          <select className="input" value={w.member} onChange={(e) => setW({ ...w, member: e.target.value })} aria-label="Thành viên">
            {state.members.map((m) => <option key={m.id} value={m.id}>{m.name} — ví {vnd(m.balance)}</option>)}
          </select>
          <select className="input" value={w.type} onChange={(e) => setW({ ...w, type: e.target.value })} aria-label="Loại">
            <option value="deposit">Nạp tiền (đã nhận tiền)</option><option value="adjustment">Điều chỉnh (+/−, có lý do)</option>
          </select>
          <input className="input" inputMode="numeric" placeholder={w.type === 'adjustment' ? 'Số tiền, âm để trừ: -50000' : 'Số tiền'} value={w.amount} onChange={(e) => setW({ ...w, amount: e.target.value })} aria-label="Số tiền" />
          <input className="input" placeholder="Ghi chú (bắt buộc)" value={w.note} onChange={(e) => setW({ ...w, note: e.target.value })} aria-label="Ghi chú" />
          <button className="btn primary" onClick={async () => (await askConfirm('Ghi nhận giao dịch này? Giao dịch không thể sửa/xóa.')) && (await call('admin_wallet_entry', { p_member: w.member, p_type: w.type, p_amount: num(w.amount), p_note: w.note }, 'Đã ghi nhận.', reload)) && setW({ ...w, amount: '', note: '' })}>Ghi nhận</button>
        </div>
        <div className="card stack">
          <h3 className="display" style={{ fontSize: 22 }}>Quỹ chung · {vnd(state.fund.balance)}</h3>
          <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Loại">
            <option value="contribution">Đóng góp bổ sung</option><option value="expense">Chi quỹ</option><option value="adjustment">Điều chỉnh (+/−)</option>
          </select>
          <input className="input" inputMode="numeric" placeholder="Số tiền" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Số tiền" />
          <input className="input" placeholder="Ghi chú (bắt buộc)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Ghi chú" />
          <button className="btn primary" onClick={async () => (await askConfirm('Ghi nhận giao dịch quỹ?')) && (await call('admin_fund_entry', { p_type: f.type, p_amount: num(f.amount), p_note: f.note }, 'Đã ghi nhận.', reload)) && setF({ ...f, amount: '', note: '' })}>Ghi nhận</button>
        </div>
      </div>
      <div className="grid gm2 section">
        <div className="card"><h3 className="display" style={{ fontSize: 20 }}>Giao dịch ví (mới nhất)</h3><TxList items={state.wallet_tx.slice(0, 80)} members={state.members} showMember /></div>
        <div className="card"><h3 className="display" style={{ fontSize: 20 }}>Giao dịch quỹ</h3><TxList items={state.fund_tx.slice(0, 80)} members={state.members} showMember /></div>
      </div>
    </>
  )
}

function ADays({ state, reload, month, setMonth }) {
  const [m, setM] = useState(state.members[0]?.id)
  const [day, setDay] = useState(addDays(state.today, -1))
  const [status, setStatus] = useState('admin_excused')
  const [note, setNote] = useState('')
  const member = state.members.find((x) => x.id === m)
  const inMonth = day.slice(0, 7) === state.month.slice(0, 7)
  const cur = member && inMonth ? STATUS_LABEL[dayStatus(day, member, state)] : null
  return (
    <div className="card stack" style={{ maxWidth: 560 }}>
      <h3 className="display" style={{ fontSize: 22 }}>Điều chỉnh trạng thái ngày</h3>
      <p className="small muted" style={{ margin: 0 }}>Dùng khi cần sửa sai sót. Miễn phạt sẽ hoàn tiền đã trừ về ví; mọi thao tác được ghi nhật ký.</p>
      <select className="input" value={m} onChange={(e) => setM(e.target.value)} aria-label="Thành viên">{state.members.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input type="date" className="input" value={day} max={state.today} onChange={(e) => { setDay(e.target.value); const mm = e.target.value.slice(0, 8) + '01'; if (mm !== month) setMonth(mm) }} aria-label="Ngày" />
      {cur && <div className="small">Hiện tại: <b>{cur}</b></div>}
      <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Trạng thái mới">
        <option value="admin_excused">Miễn phạt (xanh dương)</option><option value="trained">Xác nhận đã tập</option><option value="clear">Xóa trạng thái (tính phạt lại nếu ngày đã qua)</option>
      </select>
      <input className="input" placeholder="Lý do điều chỉnh (bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Lý do" />
      <button className="btn primary" onClick={async () => (await askConfirm('Áp dụng điều chỉnh?')) && (await call('admin_set_day', { p_member: m, p_day: day, p_status: status, p_note: note }, 'Đã điều chỉnh.', () => reload(day.slice(0, 8) + '01'))) && setNote('')}>Áp dụng</button>
    </div>
  )
}

function ASettings({ state, reload }) {
  const s = state.settings
  const [v, setV] = useState({ ...s, off_text: (s.off_dates || []).join(', ') })
  const toggle = (d) => setV({ ...v, workdays: v.workdays.includes(d) ? v.workdays.filter((x) => x !== d) : [...v.workdays, d].sort() })
  async function save() {
    const off = v.off_text.split(/[\s,;]+/).filter(Boolean)
    if (off.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) return toast('Ngày nghỉ thêm phải dạng YYYY-MM-DD.', true)
    if (!(await askConfirm('Lưu cài đặt? Chỉ áp dụng cho các ngày chưa chốt.'))) return
    await call('admin_update_settings', { p: { monthly_fee: Number(v.monthly_fee || 0), penalty_amount: Number(v.penalty_amount), workdays: v.workdays, off_dates: off, checkin_start: v.checkin_start, checkin_end: v.checkin_end, challenge_start: v.challenge_start, allow_self_join: !!v.allow_self_join, join_code: v.join_code || '', treasurer: v.treasurer || '', pay_bank: v.pay_bank || '', pay_account: v.pay_account || '', pay_name: v.pay_name || '' } }, 'Đã lưu cài đặt.', reload)
  }
  return (
    <div className="card stack" style={{ maxWidth: 620 }}>
      <h3 className="display" style={{ fontSize: 22 }}>Quy định</h3>
      <div className="field"><label htmlFor="pa">Mức phạt / ngày (VNĐ)</label><input id="pa" className="input" inputMode="numeric" value={v.penalty_amount} onChange={(e) => setV({ ...v, penalty_amount: e.target.value.replace(/\D/g, '') })} /></div>
      <div className="field"><label htmlFor="mf">Ký quỹ tháng (VNĐ, 0 = không yêu cầu)</label><input id="mf" className="input" inputMode="numeric" value={v.monthly_fee ?? 0} onChange={(e) => setV({ ...v, monthly_fee: e.target.value.replace(/\D/g, '') })} />
        <span className="small dim">Tính theo ngày: người vào giữa tháng đóng = phí × (ngày bắt buộc còn lại ÷ {state.month_days} ngày bắt buộc của tháng). Ví dụ phí {Number(v.monthly_fee || 0).toLocaleString('vi-VN')}đ, còn 10 ngày → {(Math.round((Number(v.monthly_fee || 0) * 10) / (state.month_days || 1) / 1000) * 1000).toLocaleString('vi-VN')}đ. Tiền nằm trong ví thành viên, chỉ trừ sang quỹ khi bị phạt. Số dư tháng trước được tính sang tháng sau.</span>
      </div>
      <div className="field"><label>Ngày bắt buộc tập</label>
        <div className="daychips">{[1, 2, 3, 4, 5, 6, 7].map((d) => <button key={d} className={v.workdays.includes(d) ? 'on' : ''} onClick={() => toggle(d)} aria-pressed={v.workdays.includes(d)}>{WEEKDAYS[d - 1]}</button>)}</div>
      </div>
      <div className="grid g2">
        <div className="field"><label htmlFor="cs">Check-in từ</label><input id="cs" type="time" className="input" value={v.checkin_start.slice(0, 5)} onChange={(e) => setV({ ...v, checkin_start: e.target.value })} /></div>
        <div className="field"><label htmlFor="ce">Check-in đến</label><input id="ce" type="time" className="input" value={v.checkin_end.slice(0, 5)} onChange={(e) => setV({ ...v, checkin_end: e.target.value + (e.target.value.length === 5 ? ':59' : '') })} /></div>
      </div>
      <div className="field"><label htmlFor="st">Ngày bắt đầu thử thách</label><input id="st" type="date" className="input" value={v.challenge_start} onChange={(e) => setV({ ...v, challenge_start: e.target.value })} /></div>
      <div className="field"><label htmlFor="od">Ngày nghỉ thêm (lễ, Tết) — cách nhau bằng dấu phẩy</label><input id="od" className="input" placeholder="2027-01-01, 2027-02-16" value={v.off_text} onChange={(e) => setV({ ...v, off_text: e.target.value })} /></div>
      <h3 className="display" style={{ fontSize: 22, marginTop: 10 }}>Thủ quỹ nhận tiền</h3>
      <p className="small muted" style={{ margin: 0 }}>Thành viên chuyển khoản trực tiếp vào tài khoản này (app tạo mã VietQR có sẵn số tiền + nội dung). App không giữ tiền; thủ quỹ xác nhận khi đã nhận.</p>
      <div className="field"><label htmlFor="tq">Tên thủ quỹ</label><input id="tq" className="input" value={v.treasurer || ''} onChange={(e) => setV({ ...v, treasurer: e.target.value })} placeholder="Ví dụ: Anh An" /></div>
      <div className="grid g2">
        <div className="field"><label htmlFor="bk">Ngân hàng</label>
          <select id="bk" className="input" value={v.pay_bank || ''} onChange={(e) => setV({ ...v, pay_bank: e.target.value })}>
            <option value="">— Chọn ngân hàng —</option>
            {['VCB', 'TCB', 'MB', 'ACB', 'BIDV', 'ICB', 'VBA', 'VPB', 'TPB', 'STB', 'VIB', 'HDB', 'SHB', 'OCB', 'MSB', 'EIB', 'LPB', 'SEAB', 'NAB', 'CAKE', 'TIMO'].map((b) => <option key={b} value={b}>{({ VCB: 'Vietcombank', TCB: 'Techcombank', MB: 'MB Bank', ACB: 'ACB', BIDV: 'BIDV', ICB: 'VietinBank', VBA: 'Agribank', VPB: 'VPBank', TPB: 'TPBank', STB: 'Sacombank', VIB: 'VIB', HDB: 'HDBank', SHB: 'SHB', OCB: 'OCB', MSB: 'MSB', EIB: 'Eximbank', LPB: 'LPBank', SEAB: 'SeABank', NAB: 'Nam A Bank', CAKE: 'CAKE', TIMO: 'Timo' })[b]}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="ac">Số tài khoản</label><input id="ac" className="input" inputMode="numeric" value={v.pay_account || ''} onChange={(e) => setV({ ...v, pay_account: e.target.value.replace(/[^0-9]/g, '') })} /></div>
      </div>
      <div className="field"><label htmlFor="an">Tên chủ tài khoản (không dấu)</label><input id="an" className="input" value={v.pay_name || ''} onChange={(e) => setV({ ...v, pay_name: e.target.value.toUpperCase() })} placeholder="NGUYEN VAN A" /></div>
      <h3 className="display" style={{ fontSize: 22, marginTop: 10 }}>Thành viên mới tự tham gia</h3>
      <label className="row" style={{ gap: 10, fontWeight: 600 }}>
        <input type="checkbox" checked={!!v.allow_self_join} onChange={(e) => setV({ ...v, allow_self_join: e.target.checked })} style={{ width: 22, height: 22, accentColor: 'var(--neon)' }} />
        Cho phép tự tham gia bằng mã mời
      </label>
      <div className="field"><label htmlFor="jcode">Mã mời (gửi cho người muốn tham gia)</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="jcode" className="input grow" value={v.join_code || ''} onChange={(e) => setV({ ...v, join_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) })} />
          <button className="btn sm" type="button" onClick={() => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(6)); setV({ ...v, join_code: [...r].map((x) => a[x % 32]).join('') }) }}>Tạo mã mới</button>
        </div>
        <span className="small dim">Đổi mã thì mã cũ hết hiệu lực ngay sau khi lưu.</span>
      </div>
      <button className="btn primary" onClick={save}>Lưu cài đặt</button>
    </div>
  )
}

function AReport({ state, reload, month, setMonth }) {
  const rep = state.closing ? state.closing.snapshot : state.report
  const over = shiftMonth(state.month, 1) <= state.today
  return (
    <>
      <div className="row wrap between" style={{ marginBottom: 12, gap: 10 }}>
        <MonthNav month={month} setMonth={setMonth} state={state} />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => exportExcel(rep, state.month.slice(0, 7))}><Icon n="download" width="18" />Excel</button>
          <button className="btn sm" onClick={() => window.print()}><Icon n="download" width="18" />PDF</button>
          <button className="btn sm primary" disabled={!over} title={over ? '' : 'Tháng chưa kết thúc'} onClick={async () => (await askConfirm('Chốt tháng này? Bản chốt sẽ được lưu để xem lại.')) && call('admin_close_month', { p_month: state.month }, 'Đã chốt tháng.', () => reload(state.month))}>{state.closing ? 'Chốt lại' : 'Chốt tháng'}</button>
        </div>
      </div>
      <ReportView rep={rep} closing={state.closing} />
    </>
  )
}

function AAudit() {
  const [rows, setRows] = useState(null)
  useEffect(() => { rpc('admin_audit', { p_limit: 300 }).then(setRows).catch((e) => toast(errText(e), true)) }, [])
  if (!rows) return <div className="spinner" />
  return (
    <div className="card list">
      {rows.length === 0 && <div className="empty">Chưa có thao tác nào.</div>}
      {rows.map((r) => (
        <div className="li" key={r.id} style={{ alignItems: 'flex-start' }}>
          <div className="grow"><b>{r.action}</b> <span className="small muted">· {r.actor}</span>
            <div className="small dim" style={{ wordBreak: 'break-word' }}>{JSON.stringify(r.details)}</div></div>
          <span className="small dim" style={{ whiteSpace: 'nowrap' }}>{dateTimeVN(r.at)}</span>
        </div>
      ))}
    </div>
  )
}

function ABackup() {
  const [busy, setBusy] = useState(false)
  async function dl() {
    setBusy(true)
    try {
      const data = await rpc('admin_export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
      a.download = `gym-challenge-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href)
    } catch (e) { toast(errText(e), true) } finally { setBusy(false) }
  }
  return (
    <div className="card stack" style={{ maxWidth: 620 }}>
      <h3 className="display" style={{ fontSize: 22 }}>Sao lưu & xuất dữ liệu</h3>
      <p className="muted small" style={{ margin: 0 }}>Tải toàn bộ dữ liệu (thành viên, điểm danh, phạt, ví, quỹ, nhật ký) dạng JSON. PIN không được xuất. Ngoài ra GitHub Actions tự sao lưu hằng tuần nếu đã cấu hình <code>SUPABASE_DB_URL</code>.</p>
      <button className="btn primary" onClick={dl} disabled={busy}><Icon n="download" width="18" />{busy ? 'Đang xuất…' : 'Tải bản sao lưu'}</button>
    </div>
  )
}
