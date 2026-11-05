import { useState } from 'react'
import { rpc, errText } from '../api.js'
import { Icon, Sheet, celebrate, toast } from '../ui.jsx'
import { REASONS, timeVN, ddmmyyyy, WEEKDAY_FULL, isoDow } from '../util.js'

const R_ICON = { work: 'briefcase', hometown: 'homeTown', sick: 'sick', other: 'pen' }

export default function CheckIn({ state, me, token, reload }) {
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(null)
  const [note, setNote] = useState('')
  const t = me?.today
  const s = state.settings

  async function checkin() {
    if (busy) return
    setBusy(true)
    try {
      await rpc('member_checkin', { p_token: token })
      celebrate(me.streak + 1 > 1 ? `Chuỗi ${me.streak + 1} ngày!` : 'Đã tập!')
      await reload()
    } catch (e) { toast(errText(e), true); reload() }
    finally { setBusy(false) }
  }
  async function absence() {
    if (!reason) return toast('Chọn 1 lý do.', true)
    if (reason === 'other' && !note.trim()) return toast('Vui lòng nhập nội dung lý do.', true)
    setBusy(true)
    try {
      await rpc('member_register_absence', { p_token: token, p_reason: reason, p_note: reason === 'other' ? note : null })
      setOpen(false); toast('Đã ghi nhận vắng có lý do — miễn phạt hôm nay.')
      await reload()
    } catch (e) { toast(errText(e), true) }
    finally { setBusy(false) }
  }

  const done = t?.status === 'trained'
  const excused = t && t.status !== 'trained'

  return (
    <div className="checkin-wrap">
      <div>
        <div className="display neon" style={{ letterSpacing: '.18em', fontWeight: 700 }}>{WEEKDAY_FULL[isoDow(state.today)]} · {ddmmyyyy(state.today)}</div>
        <h1 className="display" style={{ fontSize: 40, marginTop: 4 }}>{done ? 'Hôm nay xong rồi!' : excused ? 'Đã báo vắng' : state.today_mandatory ? 'Hôm nay tập chưa?' : 'Hôm nay nghỉ'}</h1>
        {!state.today_mandatory && !done && <p className="muted" style={{ margin: '6px 0 0' }}>Ngày nghỉ cố định, không bị phạt. Vẫn có thể check-in buổi tập thêm.</p>}
      </div>

      <button className={'big-check' + (done ? ' done' : excused ? ' excused' : ' pulse')} onClick={checkin} disabled={busy || done}
        aria-label={done ? 'Đã check-in hôm nay' : 'Tôi đã tập hôm nay'}>
        <span className="lbl">
          {done ? <>Đã tập<small>lúc {timeVN(t.at)}</small></> : <>Tôi đã tập<br />hôm nay<small>{busy ? 'Đang lưu…' : 'Nhấn để check-in'}</small></>}
        </span>
      </button>

      <div className="row" style={{ gap: 22, justifyContent: 'center' }}>
        <div><div className="streak"><Icon n="flame" />{me.streak}</div><div className="small muted">chuỗi hiện tại</div></div>
        <div><div className="streak" style={{ color: 'var(--text)' }}>{me.sessions_total}</div><div className="small muted">tổng buổi</div></div>
        <div><div className="streak" style={{ color: 'var(--text)' }}>{me.best_streak}</div><div className="small muted">chuỗi dài nhất</div></div>
      </div>

      {excused && (
        <div className="card" style={{ width: '100%', maxWidth: 460, borderColor: 'rgba(255,210,63,.4)' }}>
          <span className="pill excused">{t.status === 'admin_excused' ? 'Admin miễn phạt' : REASONS[t.reason]}</span>
          {t.note && <p style={{ margin: '10px 0 0' }}>{t.note}</p>}
          <p className="small muted" style={{ margin: '8px 0 0' }}>Đổi ý và đi tập? Nhấn nút check-in phía trên trước 24:00 hôm nay.</p>
        </div>
      )}

      {state.today_mandatory && t?.status !== 'admin_excused' && !done && (
        <button className="btn block" style={{ maxWidth: 460 }} onClick={() => { setReason(t?.reason || null); setNote(t?.note || ''); setOpen(true) }}>
          {excused ? 'Đổi lý do vắng' : 'HÔM NAY TÔI KHÔNG THỂ TẬP'}
        </button>
      )}
      {done && <p className="small dim" style={{ maxWidth: 420, margin: 0 }}>Đã ghi nhận buổi tập hôm nay. Mỗi ngày chỉ check-in 1 lần và không đổi sang báo vắng.</p>}
      <p className="small dim" style={{ margin: 0 }}>Khung giờ check-in: {s.checkin_start.slice(0, 5)} – {s.checkin_end.slice(0, 5)} · Hết ngày chưa tập và chưa báo lý do: phạt {s.penalty_amount.toLocaleString('vi-VN')}đ</p>

      {open && (
        <Sheet title="Lý do vắng hôm nay" onClose={() => setOpen(false)}>
          <div className="stack">
            <div className="reasons">
              {Object.entries(REASONS).map(([k, v]) => (
                <button key={k} className={'reason' + (reason === k ? ' on' : '')} onClick={() => setReason(k)} aria-pressed={reason === k}>
                  <Icon n={R_ICON[k]} />{v}
                </button>
              ))}
            </div>
            {reason === 'other' && (
              <div className="field">
                <label htmlFor="note">Nội dung lý do (bắt buộc)</label>
                <textarea id="note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ví dụ: đi đám cưới bạn" autoFocus />
              </div>
            )}
            <p className="small muted" style={{ margin: 0 }}>Vắng có lý do được miễn phạt 100%, không cần Admin duyệt. Chỉ áp dụng cho hôm nay.</p>
            <button className="btn primary block" onClick={absence} disabled={busy}>{busy ? 'Đang lưu…' : 'Xác nhận'}</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
