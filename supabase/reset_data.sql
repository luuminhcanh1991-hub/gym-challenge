-- =====================================================================
-- GYM CHALLENGE — XÓA SẠCH DỮ LIỆU THỬ NGHIỆM, BẮT ĐẦU LẠI
-- Giữ nguyên: cấu trúc, cài đặt (mức phạt, phí tháng, mã mời), tài khoản Admin.
-- Xóa: thành viên, điểm danh, phạt, phí, ví, quỹ, nhật ký. KHÔNG thể hoàn tác.
-- Chạy trong Supabase → SQL Editor.
-- =====================================================================
truncate table public.wallet_tx, public.fund_tx, public.dues, public.penalties, public.attendance_log,
  public.attendance, public.member_sessions, public.processed_days, public.month_closings, public.audit_log,
  public.members restart identity cascade;

-- Ngày bắt đầu thử thách = hôm nay (giờ VN). Đổi ngày khác nếu muốn, ví dụ '2026-12-01'.
update public.settings set challenge_start = (now() at time zone 'Asia/Ho_Chi_Minh')::date, updated_at = now() where id = 1;

insert into public.members(name, color, joined_on)
select v.name, v.color, (select challenge_start from public.settings where id = 1)
from (values ('Anh An','#39FF88'), ('Anh Hạnh','#00E5FF'), ('Em Giáp','#FFD23F'), ('Em Tuấn','#FF6B6B'), ('Em Hoàng','#B388FF')) v(name, color);

select (select count(*) from public.members) as so_thanh_vien, challenge_start as bat_dau, monthly_fee as phi_thang, join_code as ma_moi
from public.settings where id = 1;
