import { Ava, Icon } from '../ui.jsx'
import { vnd, REASONS, timeVN } from '../util.js'

export function todayPill(m, mandatory) {
  const t = m.today
  if (m.locked) return <span className="pill">Tạm khóa</span>
  if (t?.status === 'trained') return <span className="pill trained">Đã tập {timeVN(t.at)}</span>
  if (t?.status === 'excused') return <span className="pill excused">{REASONS[t.reason]}</span>
  if (t?.status === 'admin_excused') return <span className="pill admin">Admin miễn</span>
  return mandatory ? <span className="pill pending">Chưa check-in</span> : <span className="pill rest">Nghỉ</span>
}

export default function Members({ state }) {
  return (
    <>
      <div className="section-h" style={{ marginTop: 4 }}>
        <h2>Thành viên</h2>
        <span className="muted small">{state.members.length} người</span>
      </div>
      <div className="grid gm2 g3">
        {state.members.map((m) => (
          <article key={m.id} className="card mcard" style={m.id === state.me ? { borderColor: 'rgba(61,255,122,.45)' } : null}>
            <div className="row">
              <div className={'ava-ring ' + (m.today?.status === 'trained' ? 'trained' : m.today ? 'excused' : '')}><Ava m={m} size="lg" /></div>
              <div className="grow">
                <h3 style={{ fontSize: 26 }}>{m.name}{m.id === state.me && <span className="small neon" style={{ fontFamily: 'var(--body)', marginLeft: 8 }}>Bạn</span>}</h3>
                <div style={{ marginTop: 6 }}>{todayPill(m, state.today_mandatory)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="streak"><Icon n="flame" />{m.streak}</div>
                <div className="small dim">chuỗi</div>
              </div>
            </div>
            <div className="mstats">
              <div><b className="neon">{m.sessions_total}</b><span>Buổi tập</span></div>
              <div><b style={{ color: 'var(--yellow)' }}>{m.excused_total}</b><span>Vắng có lý do</span></div>
              <div><b style={{ color: m.penalized_total ? 'var(--red)' : undefined }}>{m.penalized_total}</b><span>Ngày bị phạt</span></div>
            </div>
            <div className="row between small">
              <span className="muted">Đã bị phạt</span><b>{vnd(m.penalty_amount_total)}</b>
            </div>
            {state.settings.monthly_fee > 0 && m.fee_month && (
              <div className="row between small" style={{ marginTop: -6 }}>
                <span className="muted">Phí tháng ({m.fee_month.member_days}/{m.fee_month.month_days} ngày)</span>
                <b style={{ color: m.fee_month.status === 'voided' ? 'var(--blue)' : m.fee_month.paid >= m.fee_month.amount ? 'var(--neon)' : 'var(--red)' }}>{m.fee_month.status === 'voided' ? 'Miễn' : vnd(m.fee_month.amount)}</b>
              </div>
            )}
            <div className="row between small" style={{ marginTop: -6 }}>
              <span className="muted">Số dư ví</span>
              <b className={m.balance > 0 ? 'neon' : ''}>{vnd(m.balance)}{m.outstanding > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · nợ {vnd(m.outstanding)}</span>}</b>
            </div>
          </article>
        ))}
      </div>
      <p className="small dim" style={{ marginTop: 16 }}>Người mới: đăng xuất → “Thành viên mới? Tham gia nhóm” và nhập mã mời{state.settings.join_code ? <> <b className="neon">{state.settings.join_code}</b></> : null}. Admin cũng có thể thêm trực tiếp.</p>
    </>
  )
}
