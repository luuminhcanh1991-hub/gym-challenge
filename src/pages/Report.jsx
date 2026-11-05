import { MonthNav } from './Calendar.jsx'
import { Icon } from '../ui.jsx'
import { vnd, monthLabel, dateTimeVN } from '../util.js'

export async function exportExcel(rep, title) {
  const XLSX = await import('xlsx')
  const rows = rep.members.map((m) => ({
    'Thành viên': m.name, 'Ngày bắt buộc': rep.mandatory_days, 'Buổi tập': m.trained, 'Vắng có lý do': m.excused,
    'Vắng không lý do': m.penalized, 'Tiền phạt (đ)': m.penalty_total, 'Ngày tham gia trong tháng': m.member_days ?? '', 'Phí tháng (đ)': m.fee ?? 0, 'Số dư ví (đ)': m.balance,
  }))
  rows.push({}, { 'Thành viên': 'Quỹ chung (đ)', 'Ngày bắt buộc': rep.fund_balance })
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bao cao')
  XLSX.writeFile(wb, `gym-challenge-${title}.xlsx`)
}

export function ReportView({ rep, closing }) {
  const showFee = (rep.monthly_fee || 0) > 0 || rep.members.some((m) => m.fee > 0)
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 12 }}>
        <div className="card stat"><div className="k">Ngày bắt buộc</div><div className="v">{rep.mandatory_days}<small>/ đã qua {rep.mandatory_days_elapsed}</small></div></div>
        <div className="card stat hi"><div className="k">Tổng buổi tập</div><div className="v">{rep.members.reduce((s, m) => s + m.trained, 0)}</div></div>
        <div className="card stat"><div className="k">Tổng phạt tháng</div><div className="v">{vnd(rep.members.reduce((s, m) => s + m.penalty_total, 0))}</div></div>
        <div className="card stat"><div className="k">Quỹ chung</div><div className="v">{vnd(rep.fund_balance)}</div></div>
      </div>
      <div className="card">
        <table className="tbl">
          <thead><tr><th>Thành viên</th><th className="num">Buổi tập</th><th className="num">Vắng có lý do</th><th className="num">Vắng không lý do</th><th className="num">Tiền phạt</th>{showFee && <th className="num">Phí tháng</th>}<th className="num">Số dư ví</th></tr></thead>
          <tbody>
            {rep.members.map((m) => (
              <tr key={m.id}>
                <td className="first">{m.name}</td>
                <td className="num" data-l="Buổi tập"><b className="neon">{m.trained}</b> / {m.member_days ?? rep.mandatory_days}</td>
                <td className="num" data-l="Vắng có lý do">{m.excused}</td>
                <td className="num" data-l="Vắng không lý do" style={{ color: m.penalized ? 'var(--red)' : undefined }}>{m.penalized}</td>
                <td className="num" data-l="Tiền phạt">{vnd(m.penalty_total)}</td>
                {showFee && <td className="num" data-l="Phí tháng">{m.fee ? vnd(m.fee) : (rep.monthly_fee && m.member_days ? <span className="dim">≈ {vnd(Math.round(rep.monthly_fee * m.member_days / rep.mandatory_days / 1000) * 1000)} dự kiến</span> : vnd(0))}{m.member_days != null && m.member_days < rep.mandatory_days ? <span className="small dim"> ({m.member_days}/{rep.mandatory_days} ngày)</span> : null}</td>}
                <td className="num" data-l="Số dư ví"><b>{vnd(m.balance)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        {closing && <p className="small muted" style={{ marginBottom: 0 }}>Đã chốt lúc {dateTimeVN(closing.closed_at)}. Số liệu trên là bản chốt.</p>}
      </div>
    </>
  )
}

export default function Report({ state, month, setMonth }) {
  const rep = state.closing ? state.closing.snapshot : state.report
  const title = state.month.slice(0, 7)
  return (
    <>
      <div className="print-title"><h1>GYM CHALLENGE — Báo cáo {monthLabel(state.month)}</h1></div>
      <div className="section-h no-print" style={{ marginTop: 4, flexWrap: 'wrap' }}>
        <h2>Báo cáo tháng</h2>
        <MonthNav month={month} setMonth={setMonth} state={state} />
      </div>
      <div className="row wrap no-print" style={{ marginBottom: 14, gap: 8 }}>
        {state.closing ? <span className="pill trained">Đã chốt tháng</span> : <span className="pill pending">Số liệu đang cập nhật</span>}
        <span className="grow" />
        <button className="btn sm" onClick={() => exportExcel(rep, title)}><Icon n="download" width="18" />Excel</button>
        <button className="btn sm" onClick={() => window.print()}><Icon n="download" width="18" />PDF</button>
      </div>
      <ReportView rep={rep} closing={state.closing} />
    </>
  )
}
