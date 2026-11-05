\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
-- Phí tháng theo ngày tham gia (chạy sau 30_join_recovery.sql)
update settings set allow_self_join = true, monthly_fee = 0;
update test_clock set t = '2026-12-01 08:00';
select process_penalties();
select t_eq((select count(*) from dues)::int, 0, 'F0 phí tháng = 0 → không thu');
update members set locked = true where name = 'Em Hoàng';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_update_settings('{"monthly_fee": 260000}') is null;
reset request.jwt.claim.sub;
reset role;
select process_penalties(); select process_penalties();
select t_eq(month_mandatory_days('2026-12-01'), 27, 'F1 Tháng 12/2026: 31 ngày − 4 CN = 27 ngày bắt buộc');
select t_eq((select amount from dues d join members m on m.id = d.member_id where m.name = 'Anh An'), 260000, 'F2 thành viên từ đầu tháng đóng đủ 260.000đ');
select t_eq((select count(*) from dues d join members m on m.id = d.member_id where m.name = 'Anh An')::int, 1, 'F3 chỉ thu 1 lần / người / tháng');
select t_eq((select count(*) from dues d join members m on m.id = d.member_id where m.name = 'Em Hoàng')::int, 0, 'F4 tài khoản khóa không bị thu phí');
update members set locked = false where name = 'Em Hoàng';

-- Người mới vào ngày 15/12
update test_clock set t = '2026-12-15 10:00';
set role anon;
select member_join('GYM2026', 'Em Lan', '1212') as lan \gset
reset role;
select process_penalties();
select id as lanid from members where name = 'Em Lan' \gset
select t_eq((select member_days from dues where member_id = :'lanid'), 15, 'F5 vào 15/12 → còn 15 ngày bắt buộc (15–31/12 trừ 2 CN)');
select t_eq((select amount from dues where member_id = :'lanid'), 144000, 'F6 phí = 260.000 × 15/27 ≈ 144.000đ (ít hơn người vào từ đầu)');
select t_eq((select paid from dues where member_id = :'lanid'), 0, 'F7 ví trống → ghi nợ phí');
select t_eq((select count(*) from penalties where member_id = :'lanid')::int, 0, 'F8 không phạt các ngày trước khi tham gia');
-- Nạp 100k: trả phí trước (ngày 01/12) → còn nợ 44k
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_wallet_entry(:'lanid', 'deposit', 100000, 'Tiền mặt') is null;
reset request.jwt.claim.sub;
reset role;
select t_eq((select paid from dues where member_id = :'lanid'), 100000, 'F9 nạp tiền tự trả phí tháng');
select t_eq(wallet_balance(:'lanid'), 0, 'F10 không âm ví');
set role anon;
select t_eq((select (x->>'outstanding')::int from jsonb_array_elements(app_state(:'lan'::jsonb->>'token')->'members') x where x->>'id' = :'lanid'), 44000, 'F11 còn nợ 44.000đ hiển thị cho thành viên');
reset role;
-- Admin miễn phí → hoàn 100k
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_void_due(:'lanid', '2026-12-01', 'Thành viên mới, nhóm miễn tháng đầu') is null;
reset request.jwt.claim.sub;
reset role;
select t_eq(wallet_balance(:'lanid'), 100000, 'F12 Admin miễn phí → hoàn tiền về ví');
select t_eq((select status from dues where member_id = :'lanid'), 'voided', 'F13 khoản phí chuyển trạng thái miễn');
select t_eq(((select sum(amount) from wallet_tx where status='confirmed') + (select sum(amount) from fund_tx))::int,
  ((select sum(amount) from wallet_tx where status='confirmed' and type='deposit') + (select coalesce(sum(amount),0) from wallet_tx where status='confirmed' and type='adjustment'))::int, 'F14 cân đối: ví + quỹ = tiền thật đã nộp');
select t_eq((select sum((x->>'fee')::int) from jsonb_array_elements(month_report('2026-12-01')->'members') x)::int,
  (select sum(amount) from dues where status='active' and month='2026-12-01')::int, 'F15 báo cáo tháng khớp sổ phí');
set role anon;
select t_eq((join_info()->>'fee_if_join_today')::int, 144000, 'F16 màn hình tham gia báo trước phí nếu vào hôm nay');
reset role;
-- Miễn rồi xóa trạng thái → tính phạt lại, ví khớp
select id as gid from members where name = 'Em Giáp' \gset
select wallet_balance(:'gid') as gb0 \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_wallet_entry(:'gid', 'deposit', 300000, 'test') is null;
reset role;
select wallet_balance(:'gid') as gb1 \gset
set role authenticated;
select admin_set_day(:'gid', '2026-12-02', 'admin_excused', 'test miễn') is null;
select admin_set_day(:'gid', '2026-12-02', 'clear', 'test xóa') is null;
reset request.jwt.claim.sub;
reset role;
select t_eq((select status from penalties where member_id = :'gid' and day = '2026-12-02'), 'active', 'F17 xóa trạng thái → phạt có hiệu lực lại');
select t_eq(wallet_balance(:'gid'), :gb1, 'F18 miễn rồi phạt lại: ví về đúng số trước đó');
