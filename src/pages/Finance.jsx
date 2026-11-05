import { useState } from 'react'
import { rpc, errText } from '../api.js'
import { Ava, Sheet, toast } from '../ui.jsx'
import { vnd, TX_LABEL, dateTimeVN, ddmmyyyy } from '../util.js'

export function TxList({ items, members, showMember, empty = 'Chưa có giao dịch' }) {
  if (!items.length) return <div className="empty small">{empty}</div>
  return (
    <div className="list">
      {items.map((t) => {
        const m = members.find((x) => x.id === t.member_id)
        return (
          <div className="li" key={t.id}>
            {showMember && m ? <Ava m={m} size="sm" /> : null}
            <div className="grow">
              <b>{TX_LABEL[t.type] || t.type}</b>{showMember && m && <span className="muted"> · {m.name}</span>}
              {t.status && t.status !== 'confirmed' && <span className={'pill no-dot ' + (t.status === 'pending' ? 'excused' : 'penalty')} style={{ marginLeft: 8 }}>{t.status === 'pending' ? 'Chờ xác nhận' : 'Từ chối'}</span>}
              <div className="small dim">{dateTimeVN(t.created_at)}{t.note ? ' · ' + t.note : ''}</div>
            </div>
            <span className={'amt ' + (t.status && t.status !== 'confirmed' ? '' : t.amount >= 0 ? 'plus' : 'minus')} style={t.status === 'rejected' ? { textDecoration: 'line-through', color: 'var(--dim)' } : null}>
              {t.amount > 0 ? '+' : ''}{vnd(t.amount)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function FeeCard({ m, fee }) {
  const d = m.fee_month, pv = m.fee_preview || {}
  const required = pv.amount || 0, md = d ? d.member_days : pv.member_days, td = d ? d.month_days : pv.month_days
  const topup = d ? d.amount : Math.max(0, required - Math.max(0, m.balance))
  const left = d ? Math.max(0, d.amount - d.paid) : topup
  return (
    <div className="card section" style={{ marginTop: 12, borderColor: 'rgba(227,181,103,.35)' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="small" style={{ color: 'var(--gold)', fontWeight: 700, letterSpacing: '.08em' }}>KÝ QUỸ THÁNG NÀY</div>
          <div className="display" style={{ fontSize: 34, fontWeight: 800 }}>{vnd(required)}</div>
        </div>
        {d && d.status === 'voided' ? <span className="pill admin">Được miễn</span> : left === 0 ? <span className="pill trained">Đã đủ</span> : <span className="pill penalty">Cần nạp {vnd(left)}</span>}
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {vnd(fee)} × {md}/{td} ngày bắt buộc{md < td ? ' (tính từ ngày bạn tham gia đến hết tháng)' : ''}. Tiền nằm trong ví của bạn; chỉ khi vắng không lý do mới trừ tiền phạt sang quỹ nhóm.
        {d && d.amount < required ? ` Số dư tháng trước đã được tính, chỉ cần nạp thêm ${vnd(d.amount)}.` : ''}
      </p>
    </div>
  )
}

export function PayInfo({ s, amount, memo }) {
  if (!s.pay_account) return <p className="small muted" style={{ margin: 0 }}>Chuyển tiền cho thủ quỹ{s.treasurer ? ` (${s.treasurer})` : ''}, sau đó gửi yêu cầu này.</p>
  const qr = `https://img.vietqr.io/image/${encodeURIComponent(s.pay_bank)}-${encodeURIComponent(s.pay_account)}-compact2.png?amount=${amount || 0}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(s.pay_name || '')}`
  return (
    <div className="card pad-s stack" style={{ gap: 8, borderColor: 'rgba(227,181,103,.35)' }}>
      <div className="small" style={{ color: 'var(--gold)', fontWeight: 700, letterSpacing: '.08em' }}>CHUYỂN KHOẢN CHO THỦ QUỸ{s.treasurer ? ` · ${s.treasurer.toUpperCase()}` : ''}</div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        {amount > 0 && <img src={qr} alt="Mã QR chuyển khoản" width="150" height="150" style={{ borderRadius: 12, background: '#fff', padding: 4 }} />}
        <div className="small stack" style={{ gap: 4 }}>
          <div>Ngân hàng: <b>{s.pay_bank}</b></div>
          <div>Số tài khoản: <b style={{ userSelect: 'all' }}>{s.pay_account}</b></div>
          <div>Chủ tài khoản: <b>{s.pay_name}</b></div>
          <div>Nội dung: <b style={{ userSelect: 'all' }}>{memo}</b></div>
          <div className="dim">Quét QR bằng app ngân hàng, số tiền và nội dung điền sẵn.</div>
        </div>
      </div>
    </div>
  )
}

export default function Finance({ state, me, token, reload }) {
  const [tab, setTab] = useState('wallet')
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const myTx = state.wallet_tx.filter((t) => t.member_id === me.id)
  const pending = myTx.filter((t) => t.status === 'pending')
  const f = state.fund
  const fee = state.settings.monthly_fee || 0

  async function deposit() {
    const n = Number(String(amount).replace(/\D/g, ''))
    setBusy(true)
    try {
      await rpc('member_request_deposit', { p_token: token, p_amount: n, p_note: note, p_key: key })
      setOpen(false); setAmount(''); setNote(''); setKey(crypto.randomUUID())
      toast('Đã gửi yêu cầu nạp. Chờ Admin xác nhận khi nhận được tiền.')
      reload()
    } catch (e) { toast(errText(e), true) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="section-h" style={{ marginTop: 4 }}><h2>Tài chính</h2></div>
      <div className="seg" style={{ marginBottom: 14 }}>
        {[['wallet', 'Ví của tôi'], ['fund', 'Quỹ nhóm'], ['penalties', 'Lịch sử phạt'], ['all', 'Ví cả nhóm']].map(([k, v]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>
        ))}
      </div>

      {tab === 'wallet' && (
        <>
          <div className="card stat hi">
            <div className="k">Số dư ví</div>
            <div className="v" style={{ fontSize: 46 }}>{vnd(me.balance)}</div>
            {me.outstanding > 0 && <div style={{ color: 'var(--red)', fontWeight: 700, marginTop: 8 }}>Còn thiếu (ký quỹ + phạt): {vnd(me.outstanding)}</div>}
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => setOpen(true)}>Nạp tiền vào ví</button>
          </div>
          {fee > 0 && <FeeCard m={me} fee={fee} />}
          <div className="grid g3 section" style={{ marginTop: 12 }}>
            <div className="card stat"><div className="k">Đã nạp</div><div className="v">{vnd(me.deposited_total)}</div></div>
            <div className="card stat"><div className="k">Đã bị phạt</div><div className="v" style={{ color: me.penalty_amount_total ? 'var(--red)' : undefined }}>{vnd(me.penalty_amount_total)}</div></div>
            <div className="card stat"><div className="k">Chờ xác nhận</div><div className="v">{vnd(pending.reduce((s, t) => s + t.amount, 0))}</div></div>
          </div>
          <div className="card section"><h3 className="display" style={{ fontSize: 20, marginBottom: 4 }}>Lịch sử giao dịch</h3><TxList items={myTx} members={state.members} /></div>
        </>
      )}

      {tab === 'fund' && (
        <>
          <div className="card stat hi"><div className="k">Số dư quỹ chung</div><div className="v" style={{ fontSize: 46 }}>{vnd(f.balance)}</div></div>
          <div className="grid g4 section" style={{ marginTop: 12 }}>
            <div className="card stat"><div className="k">Phạt đã thu</div><div className="v">{vnd(f.penalty_collected)}</div></div>
            <div className="card stat"><div className="k">Phạt chưa thu</div><div className="v" style={{ color: f.penalty_uncollected ? 'var(--red)' : undefined }}>{vnd(f.penalty_uncollected)}</div></div>
            {f.fee_collected > 0 && <div className="card stat"><div className="k">Phí tháng (cũ)</div><div className="v">{vnd(f.fee_collected)}</div></div>}
            <div className="card stat"><div className="k">Đóng góp thêm</div><div className="v">{vnd(f.contributions)}</div></div>
            <div className="card stat"><div className="k">Đã chi</div><div className="v">{vnd(f.expenses)}</div></div>
          </div>
          <div className="card section"><h3 className="display" style={{ fontSize: 20, marginBottom: 4 }}>Giao dịch quỹ</h3><TxList items={state.fund_tx} members={state.members} showMember /></div>
        </>
      )}

      {tab === 'penalties' && (
        <div className="card">
          <h3 className="display" style={{ fontSize: 20, marginBottom: 4 }}>Tiền phạt {state.month.slice(5, 7)}/{state.month.slice(0, 4)}</h3>
          {state.penalties.length === 0 ? <div className="empty small">Tháng này chưa ai bị phạt. Giữ vững!</div> : (
            <div className="list">
              {[...state.penalties].reverse().map((p) => {
                const m = state.members.find((x) => x.id === p.member_id)
                return (
                  <div className="li" key={p.id}>
                    {m && <Ava m={m} size="sm" />}
                    <div className="grow"><b>{m?.name}</b><div className="small dim">Ngày {ddmmyyyy(p.day)}{p.status === 'voided' ? ' · Admin miễn: ' + (p.void_reason || '') : p.paid < p.amount ? ` · chưa thu ${vnd(p.amount - p.paid)}` : ' · đã thu'}</div></div>
                    <span className="amt minus" style={p.status === 'voided' ? { textDecoration: 'line-through', color: 'var(--dim)' } : null}>{vnd(p.amount)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'all' && (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Thành viên</th><th className="num">Đã nạp</th><th className="num">Đã bị phạt</th><th className="num">Ký quỹ tháng</th><th className="num">Còn thiếu</th><th className="num">Số dư</th></tr></thead>
            <tbody>
              {state.members.map((m) => (
                <tr key={m.id}>
                  <td className="first">{m.name}</td>
                  <td className="num" data-l="Đã nạp">{vnd(m.deposited_total)}</td>
                  <td className="num" data-l="Đã bị phạt">{vnd(m.penalty_amount_total)}</td>
                  <td className="num" data-l="Ký quỹ tháng">{m.fee_preview?.amount ? vnd(m.fee_preview.amount) : '—'}</td>
                  <td className="num" data-l="Còn thiếu" style={{ color: m.outstanding ? 'var(--red)' : undefined }}>{vnd(m.outstanding)}</td>
                  <td className="num" data-l="Số dư"><b>{vnd(m.balance)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Sheet title="Nạp tiền vào ví" onClose={() => setOpen(false)}>
          <div className="stack">
            <div className="field">
              <label htmlFor="amt">Số tiền (VNĐ)</label>
              <input id="amt" className="input" inputMode="numeric" value={amount ? Number(String(amount).replace(/\D/g, '')).toLocaleString('vi-VN') : ''}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="Ví dụ: 500.000" autoFocus />
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {[...new Set([Math.max(0, me.outstanding), fee, 500000, 1000000].filter((x) => x >= 1000))].slice(0, 4).map((v) => <button key={v} className="btn sm" onClick={() => setAmount(String(v))}>{vnd(v)}</button>)}
            </div>
            <div className="field">
              <label htmlFor="dn">Ghi chú (hình thức chuyển)</label>
              <input id="dn" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ví dụ: CK Vietcombank 10:30" />
            </div>
            <PayInfo s={state.settings} amount={Number(String(amount).replace(/\D/g, '')) || 0} memo={'GYM ' + me.name} />
            <p className="small muted" style={{ margin: 0 }}>Chuyển khoản xong mới bấm gửi. Tiền chỉ vào ví khi thủ quỹ xác nhận đã nhận đúng số tiền.</p>
            <button className="btn primary block" disabled={busy || !amount} onClick={deposit}>{busy ? 'Đang gửi…' : 'Gửi yêu cầu nạp'}</button>
          </div>
        </Sheet>
      )}
    </>
  )
}
