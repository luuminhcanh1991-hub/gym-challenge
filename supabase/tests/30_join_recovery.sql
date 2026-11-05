\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned
-- Chạy sau 10_rules.sql (cùng DB, đã có t_eq / t_err, admin)
update settings set join_code = 'GYM2026', allow_self_join = true;
update test_clock set t = '2026-11-12 09:00';

set role anon;
select t_eq((member_join('sai-ma', 'Em Minh', '1234')->>'error'), 'JOIN_CODE_WRONG', 'J1 sai mã mời bị từ chối');
select member_join('gym-2026', 'Em  Minh ', '7777') as j \gset
select t_eq((:'j'::jsonb->>'ok')::boolean, true, 'J2 tự tham gia bằng mã mời (không phân biệt hoa thường / dấu -)');
select t_eq((:'j'::jsonb->>'name'), 'Em Minh', 'J3 chuẩn hóa tên');
select t_eq((:'j'::jsonb->>'recovery_code') ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$', true, 'J4 nhận mã khôi phục');
select t_err($$select public.member_join('GYM2026', 'em minh', '1234')$$, 'NAME_TAKEN', 'J5 không trùng tên');
select t_err($$select public.member_join('GYM2026', 'Em Lan', '12')$$, 'PIN_FORMAT', 'J6 PIN phải 4–6 số');
select t_eq((app_state(:'j'::jsonb->>'token')->>'me'), :'j'::jsonb->>'member_id', 'J7 thành viên mới đăng nhập ngay');
select t_err($$select public._set_recovery(gen_random_uuid())$$, 'permission denied', 'SEC hàm nội bộ 002 bị chặn');
reset role;
select t_eq((select joined_on from members where name = 'Em Minh'), '2026-11-12'::date, 'J8 chỉ tính phạt từ ngày tham gia');
select process_penalties();
select t_eq((select count(*) from penalties p join members m on m.id = p.member_id where m.name = 'Em Minh')::int, 0, 'J9 không bị phạt lùi các ngày trước khi tham gia');

-- Khôi phục PIN
select id as minh from members where name = 'Em Minh' \gset
set role anon;
select t_eq((member_recover_pin(:'minh', 'XXXX-XXXX', '2468')->>'error'), 'RECOVERY_WRONG', 'R1 sai mã khôi phục bị từ chối');
select member_recover_pin(:'minh', lower(:'j'::jsonb->>'recovery_code'), '2468') as r \gset
select t_eq((:'r'::jsonb->>'ok')::boolean, true, 'R2 đặt PIN mới bằng mã khôi phục');
select t_eq((member_login(:'minh', '7777')->>'ok')::boolean, false, 'R3 PIN cũ hết hiệu lực');
select t_eq((member_login(:'minh', '2468')->>'ok')::boolean, true, 'R4 PIN mới đăng nhập được');
select t_err(format($$select public.app_state(%L)$$, :'j'::jsonb->>'token'), 'AUTH_REQUIRED', 'R5 phiên cũ trên thiết bị khác bị đăng xuất');
select t_eq((member_recover_pin(:'minh', :'j'::jsonb->>'recovery_code', '1357')->>'error'), 'RECOVERY_WRONG', 'R6 mã khôi phục chỉ dùng 1 lần');
select t_eq((:'r'::jsonb->>'recovery_code') <> (:'j'::jsonb->>'recovery_code'), true, 'R7 cấp mã khôi phục mới');
reset role;
-- Khóa tạm khi đoán mã quá 5 lần
update members set failed_pins = 0, pin_locked_until = null where id = :'minh';
set role anon;
select member_recover_pin(:'minh', 'AAAA-AAAA', '1111') is not null from generate_series(1, 5);
select t_err(format($$select public.member_recover_pin(%L, %L, '1111')$$, :'minh', :'r'::jsonb->>'recovery_code'), 'PIN_TEMP_LOCKED', 'R8 đoán sai 5 lần → khóa 10 phút');
reset role;

-- Admin tắt tự tham gia
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_update_settings('{"allow_self_join": false}') is null;
reset request.jwt.claim.sub;
set role anon;
select t_err($$select public.member_join('GYM2026', 'Em Lan', '1234')$$, 'JOIN_DISABLED', 'J10 Admin tắt tự tham gia');
reset role;
