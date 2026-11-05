import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configured = Boolean(URL && KEY)
export const supabase = configured
  ? createClient(URL, KEY, { auth: { persistSession: true, storageKey: 'gc-admin-auth' } })
  : null

const ERR = {
  AUTH_REQUIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  PIN_FORMAT: 'PIN gồm 4–6 chữ số.',
  PIN_WRONG: 'PIN không đúng.',
  PIN_TEMP_LOCKED: 'Nhập sai PIN quá 5 lần. Thử lại sau 10 phút.',
  ACCOUNT_LOCKED: 'Tài khoản đang bị khóa. Liên hệ Admin.',
  MEMBER_NOT_FOUND: 'Không tìm thấy thành viên.',
  ALREADY_CHECKED_IN: 'Hôm nay bạn đã check-in rồi.',
  OUTSIDE_WINDOW: 'Ngoài khung giờ check-in cho phép.',
  REASON_INVALID: 'Lý do không hợp lệ.',
  REASON_NOTE_REQUIRED: 'Vui lòng nhập nội dung lý do.',
  NOT_MANDATORY_DAY: 'Hôm nay là ngày nghỉ, không cần đăng ký vắng.',
  ALREADY_EXCUSED: 'Hôm nay bạn đã được Admin miễn.',
  AMOUNT_INVALID: 'Số tiền không hợp lệ (bội số 1.000đ).',
  TOO_MANY_PENDING: 'Bạn đang có quá nhiều yêu cầu nạp chờ xác nhận.',
  NOT_ADMIN: 'Tài khoản này không có quyền Admin.',
  NOT_PENDING: 'Giao dịch đã được xử lý.',
  NOTE_REQUIRED: 'Vui lòng nhập ghi chú.',
  NAME_REQUIRED: 'Vui lòng nhập tên.',
  MONTH_NOT_OVER: 'Tháng chưa kết thúc.',
  FUTURE_DAY: 'Không thể điều chỉnh ngày tương lai.',
  TYPE_INVALID: 'Loại giao dịch không hợp lệ.',
  STATUS_INVALID: 'Trạng thái không hợp lệ.',
  LEDGER_IMMUTABLE: 'Không được sửa giao dịch cũ.',
}

export function errText(e) {
  const msg = (e && (e.message || e.error_description || String(e))) || 'Lỗi không xác định'
  for (const k of Object.keys(ERR)) if (msg.includes(k)) return ERR[k]
  if (/duplicate key|members_name_uq/.test(msg)) return 'Tên đã tồn tại.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Mất kết nối mạng. Thử lại.'
  if (/Invalid login credentials/i.test(msg)) return 'Email hoặc mật khẩu không đúng.'
  return msg
}

export async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

const TK = 'gc-member-token'
export const session = {
  get() { try { return JSON.parse(localStorage.getItem(TK)) } catch { return null } },
  set(v) { try { localStorage.setItem(TK, JSON.stringify(v)) } catch {} },
  clear() { try { localStorage.removeItem(TK) } catch {} },
}
