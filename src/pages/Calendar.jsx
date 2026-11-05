import { useState } from 'react'
import { rpc } from '../api.js'
import { Ava, Icon, Sheet } from '../ui.jsx'
import { WEEKDAYS, WEEKDAY_FULL, isoDow, daysInMonth, monthLabel, shiftMonth, dayStatus, STATUS_LABEL, REASONS, ddmmyyyy, timeVN, vnd } from '../util.js'

const DOT = { trained: 'var(--neon)', excused: 'var(--yellow)', penalty: 'var(--red)', admin: 'var(--blue)', rest: 'var(--gray)', pending: '#c9d1cd', future: 'transparent', none: 'transparent' }

export function MonthNav({ month, setMonth, state }) {
  const cur = state.today.slice(0, 8) + '01'
  const first = state.first_month || cur
  return (
    <div className="row" style={{ gap: 8 }}>
      <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= first} aria-label="Tháng trước"><Icon n="left" /></button>
      <b className="display" style={{ fontSize: 22, minWidth: 128, textAlign: 'center' }}>{monthLabel(month)}</b>
      <button className="icon-btn" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= cur} aria-label="Tháng sau"><Icon n="right" /></button>
    </div>
  )
}

export default function Calendar({ state, me, token, month, setMonth }) {
  const [who, setWho] = useState(me?.id || 'all')
  const [sel, setSel] = useState(null)
  const [log, setLog] = useState(null)
  const m0 = state.month
  const n = daysInMonth(m0)
  const lead = isoDow(m0) - 1
  const days = Array.from({ length: n }, (_, i) => m0.slice(0, 8) + String(i + 1).padStart(2, '0'))
  const person = state.members.find((x) => x.id === who)

  const open = async (d) => {
    setSel(d); setLog(null)
    try { setLog(await rpc('day_detail', { p_token: token, p_day: d })) } catch { setLog({ log: [] }) }
  }

  return (
    <>
      <div className="section-h" style={{ marginTop: 4, flexWrap: 'wrap' }}>
        <h2>Lịch tập</h2>
        <MonthNav month={month} setMonth={setMonth} state={state} />
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={who === 'all' ? 'on' : ''} onClick={() => setWho('all')}>Cả nhóm</button>
        {state.members.map((m) => <button key={m.id} className={who === m.id ? 'on' : ''} onClick={() => setWho(m.id)}>{m.name}</button>)}
      </div>
      <div className="card pad-s">
        <div className="cal-head">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
        <div className="cal">
          {Array.from({ length: lead }).map((_, i) => <div key={'b' + i} className="cell blank" />)}
          {days.map((d) => {
            const st = person ? dayStatus(d, person, state) : null
            const sts = person ? null : state.members.map((m) => dayStatus(d, m, state))
            const groupRest = sts && sts.every((x) => x === 'rest' || x === 'none')
            const cls = person ? st : groupRest ? 'rest' : (d > state.today ? 'future' : '')
            return (
              <button key={d} className={'cell ' + cls + (d === state.today ? ' today' : '')} onClick={() => open(d)} aria-label={`${ddmmyyyy(d)}: ${person ? STATUS_LABEL[st] : ''}`}>
                <span>{Number(d.slice(8))}</span>
                {sts && !groupRest && d <= state.today && <span className="dots">{sts.map((x, i) => <i key={i} style={{ background: DOT[x] }} />)}</span>}
              </button>
            )
          })}
        </div>
        <div className="legend">
          <span className="pill trained">Đã tập</span><span className="pill excused">Vắng có lý do</span>
          <span className="pill penalty">Bị phạt</span><span className="pill rest">Chủ nhật / nghỉ</span><span className="pill admin">Admin miễn</span>
        </div>
      </div>

      {sel && (
        <Sheet title={`${WEEKDAY_FULL[isoDow(sel)]} ${ddmmyyyy(sel)}`} onClose={() => setSel(null)}>
          <div className="list">
            {state.members.map((m) => {
              const st = dayStatus(sel, m, state)
              const a = state.attendance.find((x) => x.member_id === m.id && x.day === sel)
              const p = state.penalties.find((x) => x.member_id === m.id && x.day === sel)
              return (
                <div className="li" key={m.id}>
                  <Ava m={m} size="sm" />
                  <div className="grow">
                    <b>{m.name}</b>
                    <div className="small muted">
                      {st === 'trained' && a?.at && `Check-in lúc ${timeVN(a.at)}`}
                      {st === 'excused' && (REASONS[a.reason] + (a.note ? ': ' + a.note : ''))}
                      {st === 'admin' && (a?.note || p?.void_reason || 'Điều chỉnh của Admin')}
                      {st === 'penalty' && `Phạt ${vnd(p.amount)}${p.paid < p.amount ? ` · chưa thu ${vnd(p.amount - p.paid)}` : ''}`}
                    </div>
                  </div>
                  <span className={'pill ' + st}>{STATUS_LABEL[st]}</span>
                </div>
              )
            })}
          </div>
          {log && log.log.length > 0 && (
            <div className="section" style={{ marginTop: 18 }}>
              <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>LỊCH SỬ THAY ĐỔI</div>
              {log.log.map((l, i) => {
                const m = state.members.find((x) => x.id === l.member_id)
                return <div key={i} className="small" style={{ padding: '4px 0' }}><span className="dim">{timeVN(l.at)}</span> {m?.name}: {STATUS_LABEL[l.old === 'admin_excused' ? 'admin' : l.old] || 'chưa có'} → <b>{l.new ? STATUS_LABEL[l.new === 'admin_excused' ? 'admin' : l.new] : 'xóa'}</b>{l.actor === 'admin' ? ' (Admin)' : ''}</div>
              })}
            </div>
          )}
        </Sheet>
      )}
    </>
  )
}
