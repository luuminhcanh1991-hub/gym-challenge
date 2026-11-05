import { Ava, Icon } from '../ui.jsx'
import { addDays, isMandatory, vnd } from '../util.js'

function mandatoryCount(from, to, s) {
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (isMandatory(d, s)) n++
  return n
}

export default function Ranking({ state }) {
  const s = state.settings
  const rows = state.members.map((m) => {
    const start = m.joined_on > s.challenge_start ? m.joined_on : s.challenge_start
    const upto = m.today ? state.today : addDays(state.today, -1)
    const due = Math.max(0, mandatoryCount(start, upto, s))
    const rate = due ? Math.min(1, m.sessions_total / due) : 0
    return { ...m, rate, due, absent: m.excused_total + m.penalized_total }
  })
  // dir = -1: giảm dần (cao nhất đứng đầu); dir = 1: tăng dần
  const by = (k, dir = -1) => [...rows].sort((a, b) => (dir === -1 ? b[k] - a[k] : a[k] - b[k]) || b.sessions_total - a.sessions_total)

  const cats = [
    { key: 'sessions_total', t: 'Tập nhiều nhất', icon: 'trophy', fmt: (m) => `${m.sessions_total} buổi`, list: by('sessions_total') },
    { key: 'rate', t: 'Chăm chỉ nhất', icon: 'star', fmt: (m) => `${Math.round(m.rate * 100)}%`, list: by('rate') },
    { key: 'best_streak', t: 'Chuỗi dài nhất', icon: 'flame', fmt: (m) => `${m.best_streak} ngày`, list: by('best_streak') },
    { key: 'absent', t: 'Ít vắng nhất', icon: 'shield', fmt: (m) => `${m.absent} ngày vắng`, list: by('absent', 1) },
    { key: 'penalty_amount_total', t: 'Bị phạt nhiều nhất', icon: 'alert', fmt: (m) => vnd(m.penalty_amount_total), list: by('penalty_amount_total'), warn: true },
  ]
  const top = cats[0].list
  const podium = [top[1], top[0], top[2]].filter(Boolean)
  const hasData = rows.some((r) => r.sessions_total > 0 || r.penalized_total > 0)

  return (
    <>
      <div className="section-h" style={{ marginTop: 4 }}><h2>Bảng xếp hạng</h2><span className="small muted">Toàn thử thách</span></div>
      <div className="card" style={{ background: 'radial-gradient(90% 80% at 50% 0%, rgba(61,255,122,.14), transparent 70%), var(--card)' }}>
        <div className="podium">
          {podium.map((m) => {
            const r = top.indexOf(m) + 1
            return (
              <div key={m.id} className={'pod p' + r}>
                <div className="rk">#{r}</div>
                <div className={'ava-ring' + (r === 1 ? ' trained' : '')}><Ava m={m} size={r === 1 ? 'lg' : ''} /></div>
                <div className="nm">{m.name}</div>
                <div className="display" style={{ fontSize: 22, fontWeight: 800 }}>{m.sessions_total}<span className="small muted" style={{ fontFamily: 'var(--body)' }}> buổi</span></div>
              </div>
            )
          })}
        </div>
        {!hasData && <p className="small muted" style={{ textAlign: 'center', marginBottom: 0 }}>Chưa có buổi tập nào. Ai check-in đầu tiên sẽ lên #1!</p>}
      </div>

      <div className="grid gm2 section" style={{ marginTop: 14 }}>
        {cats.slice(1).map((c) => {
          const lead = c.list[0]
          const max = Math.max(1, ...c.list.map((m) => Number(m[c.key]) || 0))
          return (
            <div key={c.key} className="card">
              <div className="row between" style={{ marginBottom: 6 }}>
                <span className="badge" style={{ color: c.warn ? 'var(--red)' : 'var(--neon)' }}><Icon n={c.icon} />{c.t}</span>
                {hasData && lead && <span className="small muted">Dẫn đầu: <b style={{ color: 'var(--text)' }}>{lead.name}</b></span>}
              </div>
              {c.list.map((m, i) => (
                <div className="rank-row" key={m.id}>
                  <div className="n" style={i === 0 && hasData ? { color: c.warn ? 'var(--red)' : 'var(--neon)' } : null}>{i + 1}</div>
                  <Ava m={m} size="sm" />
                  <div className="grow">
                    <div className="row between"><b>{m.name}</b><span className="small">{c.fmt(m)}</span></div>
                    {c.key !== 'absent' && <div className="bar"><i style={{ width: ((Number(m[c.key]) || 0) / max) * 100 + '%', background: c.warn ? 'var(--red)' : undefined }} /></div>}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
