// VietQR (chuẩn EMVCo / NAPAS 247) tạo ngay trên máy, không phụ thuộc dịch vụ ngoài
export const BANKS = {
  VCB: ['Vietcombank', '970436'], TCB: ['Techcombank', '970407'], MB: ['MB Bank', '970422'], ACB: ['ACB', '970416'],
  BIDV: ['BIDV', '970418'], ICB: ['VietinBank', '970415'], VBA: ['Agribank', '970405'], VPB: ['VPBank', '970432'],
  TPB: ['TPBank', '970423'], STB: ['Sacombank', '970403'], VIB: ['VIB', '970441'], HDB: ['HDBank', '970437'],
  SHB: ['SHB', '970443'], OCB: ['OCB', '970448'], MSB: ['MSB', '970426'], EIB: ['Eximbank', '970431'],
  LPB: ['LPBank', '970449'], SEAB: ['SeABank', '970440'], NAB: ['Nam A Bank', '970428'], CAKE: ['CAKE', '546034'], TIMO: ['Timo', '963388'],
}

const tlv = (id, v) => id + String(v.length).padStart(2, '0') + v

export function crc16(s) {
  let crc = 0xffff
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

// Bỏ dấu tiếng Việt, chỉ giữ A-Z 0-9 và khoảng trắng (nội dung CK an toàn mọi ngân hàng)
export const asciiMemo = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 25)

export function vietqrPayload({ bank, account, amount, memo }) {
  const bin = BANKS[bank]?.[1]
  if (!bin || !account) return null
  const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', account)) + tlv('02', 'QRIBFTTA')
  let p = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', merchant) + tlv('53', '704')
  if (amount) p += tlv('54', String(Math.round(amount)))
  p += tlv('58', 'VN')
  if (memo) p += tlv('62', tlv('08', asciiMemo(memo)))
  p += '6304'
  return p + crc16(p)
}
