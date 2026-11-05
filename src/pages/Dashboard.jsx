import { useEffect, useMemo, useState } from 'react'
import { Ava, Icon } from '../ui.jsx'
import { vnd, dateTimeVN, TX_LABEL, monthLabel, REASONS, timeVN, WEEKDAY_FULL, isoDow, ddmmyyyy, shiftMonth } from '../util.js'

function useCountdown(serverNow, today) {
  const offset = useMemo(() => new Date(serverNow).getTime() - Date.now(), [serverNow])
  const end = useMemo(() => {
    // 00:00 ngày đầu tháng sau, giờ VN (UTC+7)
    const next = shiftMonth(today.slice(0, 8) + '01', 1)
    return Date.parse(next + 'T00:00:00+07:00')
  }, [today])
  const [now, setNow] = useState(Date.now() + offset)
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + offset), 1000); return () => clearInterval(t) }, [offset])
  const s = Math.max(0, Math.floor((end - now) / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 }
}

export default function Dashboard({ state, me }) {
  const cd = useCountdown(state.server_now, state.today)
  const curMonth = state.today.slice(0, 8) + '01'
  const trainedMonth = state.attendance.filter((a) => a.status === 'trained').length
  const trained = state.members.filter((m) => m.today?.status === 'trained')
  const excused = state.members.filter((m) => m.today && m.today.status !== 'trained')
  const waiting = state.members.filter((m) => !m.today && !m.locked)
  const pad = (n) => String(n).padStart(2, '0')

  return (
    <>
      <section className="hero">
        <div className="slogan">TẬP ĐỀU – KHÔNG BỎ CUỘC</div>
        <h1 style={{ marginTop: 6 }}>{monthLabel(curMonth)}</h1>
        <div className="muted" style={{ marginTop: 6 }}>{WEEKDAY_FULL[isoDow(state.today)]}, {ddmmyyyy(state.today)} · {state.today_mandatory ? 'Ngày bắt buộc tập' : 'Ngày nghỉ'}</div>
        <div className="countdown" aria-label="Thời gian còn lại của tháng">
          <div className="cd"><b>{cd.d}</b><span>ngày</span></div>
          <div className="cd"><b>{pad(cd.h)}</b><span>giờ</span></div>
          <div className="cd"><b>{pad(cd.m)}</b><span>phút</span></div>
          <div className="cd"><b className="neon">{pad(cd.s)}</b><span>giây</span></div>
        </div>
        {me && me.today?.status !== 'trained' && state.today_mandatory && (
          <a href="#/checkin" className="btn primary" style={{ marginTop: 18 }}><Icon n="bolt" width="20" />Check-in hôm nay</a>
        )}
      </section>

      {me && me.outstanding > 0 && (
        <a href="#/finance" className="card row" style={{ marginTop: 14, textDecoration: 'none', color: 'inherit', borderColor: 'rgba(255,90,103,.45)' }}>
          <Icon n="alert" width="22" style={{ color: 'var(--red)' }} />
          <div className="grow"><b>Bạn còn nợ {vnd(me.outstanding)}</b><div className="small muted">Nạp thêm vào ví, hệ thống sẽ tự trả phí/phạt còn thiếu.</div></div>
          <Icon n="right" width="18" />
        </a>
      )}
      {me && <WalletPeek state={state} me={me} />}
      <div className="grid g4 section" style={{ marginTop: 14 }}>
        <div className="card stat"><div className="k">Thành viên</div><div className="v">{state.members.length}</div></div>
        <div className="card stat hi"><div className="k">Buổi tập tháng này</div><div className="v">{trainedMonth}</div></div>
        <div className="card stat"><div className="k">Quỹ nhóm</div><div className="v">{vnd(state.fund.balance)}</div></div>
        <div className="card stat"><div className="k">Tiền phạt tháng</div><div className="v" style={{ color: state.fund.penalty_month ? 'var(--red)' : undefined }}>{vnd(state.fund.penalty_month)}</div></div>
      </div>

      <div className="section grid g3">
        <TodayList title="Đã tập hôm nay" cls="trained" items={trained} render={(m) => <span className="pill trained">{timeVN(m.today.at)}</span>} />
        <TodayList title="Vắng có lý do" cls="excused" items={excused} render={(m) => <span className="pill excused">{m.today.status === 'admin_excused' ? 'Admin miễn' : REASONS[m.today.reason]}</span>} />
        <TodayList title={state.today_mandatory ? 'Chưa check-in' : 'Hôm nay nghỉ'} cls="" items={state.today_mandatory ? waiting : []} empty={state.today_mandatory ? 'Cả nhóm đã xong!' : 'Chủ nhật / ngày nghỉ — không bắt buộc tập.'} render={() => <span className="pill pending">Chờ</span>} />
      </div>
    </>
  )
}

function TodayList({ title, items, render, cls, empty = 'Chưa có ai' }) {
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h3 className="display" style={{ fontSize: 20 }}>{title}</h3>
        <span className={'pill no-dot ' + cls}>{items.length}</span>
      </div>
      {items.length === 0 ? <div className="small dim" style={{ padding: '10px 0' }}>{empty}</div> : (
        <div className="list">
          {items.map((m) => (
            <div className="li" key={m.id}><Ava m={m} size="sm" /><b className="grow">{m.name}</b>{render(m)}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function WalletPeek({ state, me }) {
  const tx = state.wallet_tx.filter((t) => t.member_id === me.id && t.status !== 'rejected').slice(0, 3)
  return (
    <a href="#/finance" className="card section" style={{ marginTop: 14, display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div className="row between">
        <div><div className="small muted" style={{ fontWeight: 700, letterSpacing: '.06em' }}>VÍ KÝ QUỸ CỦA BẠN</div><div className="display" style={{ fontSize: 30, fontWeight: 800, color: 'var(--neon)' }}>{vnd(me.balance)}</div></div>
        <Icon n="right" width="18" />
      </div>
      {tx.length > 0 && (
        <div className="list" style={{ marginTop: 6 }}>
          {tx.map((t) => (
            <div className="li" key={t.id} style={{ padding: '8px 0' }}>
              <div className="grow small"><b>{TX_LABEL[t.type] || t.type}</b>{t.status === 'pending' ? ' · chờ xác nhận' : ''}<div className="dim">{dateTimeVN(t.created_at)}{t.note ? ' · ' + t.note : ''}</div></div>
              <span className={'amt ' + (t.status === 'pending' ? '' : t.amount >= 0 ? 'plus' : 'minus')} style={{ fontSize: 17 }}>{t.amount > 0 ? '+' : ''}{vnd(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </a>
  )
}
