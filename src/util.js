export const vnd = (n) => (Number(n) || 0).toLocaleString('vi-VN') + 'đ'
export const vndShort = (n) => {
  n = Number(n) || 0
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr'
  if (Math.abs(n) >= 1e3) return Math.round(n / 1e3).toLocaleString('vi-VN') + 'k'
  return String(n)
}

export const REASONS = { work: 'Công việc', hometown: 'Về quê', sick: 'Bị bệnh', other: 'Lý do khác' }
export const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
export const WEEKDAY_FULL = { 1: 'Thứ Hai', 2: 'Thứ Ba', 3: 'Thứ Tư', 4: 'Thứ Năm', 5: 'Thứ Sáu', 6: 'Thứ Bảy', 7: 'Chủ nhật' }

// Ngày dạng 'YYYY-MM-DD' — xử lý thuần chuỗi để không lệch múi giờ
export const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }
export const fmtD = (dt) => dt.toISOString().slice(0, 10)
export const addDays = (s, n) => { const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return fmtD(d) }
export const isoDow = (s) => { const w = parseD(s).getUTCDay(); return w === 0 ? 7 : w }
export const ddmm = (s) => s.slice(8, 10) + '/' + s.slice(5, 7)
export const ddmmyyyy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4)
export const monthLabel = (s) => 'Tháng ' + Number(s.slice(5, 7)) + '/' + s.slice(0, 4)
export const daysInMonth = (m) => { const d = parseD(m); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() }
export const shiftMonth = (m, n) => { const d = parseD(m); return fmtD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))) }

export function isMandatory(day, settings) {
  if (!settings) return false
  if (day < settings.challenge_start) return false
  if ((settings.off_dates || []).includes(day)) return false
  return (settings.workdays || []).includes(isoDow(day))
}

export const timeVN = (iso) => iso ? new Date(iso).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }) : ''
export const dateTimeVN = (iso) => iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : ''

export const initials = (name) => {
  const p = name.trim().split(/\s+/)
  return (p[p.length - 1] || '?').slice(0, 2).toUpperCase()
}

// Trạng thái 1 người / 1 ngày cho lịch
export function dayStatus(day, member, state) {
  const s = state.settings
  if (member && day < member.joined_on) return 'none'
  const a = state.attendance.find((x) => x.member_id === member.id && x.day === day)
  if (a) return a.status === 'trained' ? 'trained' : a.status === 'excused' ? 'excused' : 'admin'
  const p = state.penalties.find((x) => x.member_id === member.id && x.day === day)
  if (p && p.status === 'active') return 'penalty'
  if (p && p.status === 'voided') return 'admin'
  if (!isMandatory(day, s)) return day < s.challenge_start ? 'none' : 'rest'
  if (day > state.today) return 'future'
  if (day === state.today) return 'pending'
  return 'none'
}

export const STATUS_LABEL = {
  trained: 'Đã tập', excused: 'Vắng có lý do', admin: 'Miễn phạt (Admin)', penalty: 'Vắng không lý do',
  rest: 'Ngày nghỉ', future: 'Sắp tới', pending: 'Chưa check-in', none: '—',
}
export const TX_LABEL = {
  deposit: 'Nạp tiền', penalty_payment: 'Trừ phạt', refund: 'Hoàn phạt', adjustment: 'Điều chỉnh',
  penalty_income: 'Thu phạt', contribution: 'Đóng góp', expense: 'Chi quỹ',
}
