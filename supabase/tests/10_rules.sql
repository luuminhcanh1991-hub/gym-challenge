\set ON_ERROR_STOP 1
\pset tuples_only on
\pset format unaligned

-- ===== Đồng hồ giả lập (chỉ dùng trong kiểm thử) =====
create table public.test_clock(t timestamp not null);
insert into public.test_clock values ('2026-11-02 10:00');
create or replace function public.vn_now() returns timestamp language sql stable security definer set search_path = public as $$ select t from test_clock $$;
create or replace function public.vn_today() returns date language sql stable security definer set search_path = public as $$ select (select t from test_clock)::date $$;

create function public.t_eq(actual anyelement, expected anyelement, label text) returns text language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL [%]: got %, expected %', label, actual, expected; end if;
  return 'PASS  ' || label;
end $$;
create function public.t_err(stmt text, expect text, label text) returns text language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL [%]: no error, expected %', label, expect;
exception when others then
  if sqlerrm like 'FAIL [%' then raise; end if;
  if position(expect in sqlerrm) = 0 then raise exception 'FAIL [%]: error "%" , expected %', label, sqlerrm, expect; end if;
  return 'PASS  ' || label || '  (' || sqlerrm || ')';
end $$;
grant execute on function public.t_eq(anyelement, anyelement, text), public.t_err(text, text, text) to anon, authenticated;

update settings set challenge_start = '2026-11-02';
update members set joined_on = '2026-11-02';
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000a0a0', 'admin@example.com');
select bootstrap_admin('admin@example.com');

select id as an from members where name = 'Anh An' \gset
select id as hanh from members where name = 'Anh Hạnh' \gset
select id as giap from members where name = 'Em Giáp' \gset
select id as tuan from members where name = 'Em Tuấn' \gset
select id as hoang from members where name = 'Em Hoàng' \gset

-- ================= THỨ HAI 02/11 =================
set role anon;
select t_eq(jsonb_array_length(list_members_public()), 5, '00 có 5 thành viên ban đầu');
select member_login(:'an', '1111')->>'token' as tan \gset
select member_login(:'hanh', '2222')->>'token' as thanh \gset
select member_login(:'giap', '3333')->>'token' as tgiap \gset
select member_login(:'tuan', '4444')->>'token' as ttuan \gset
select member_login(:'hoang', '5555')->>'token' as thoang \gset
select t_eq((member_login(:'an', '1111')->>'ok')::boolean, true, '01 đăng nhập đúng PIN');
select t_eq((member_login(:'an', '9999')->>'ok')::boolean, false, '01b sai PIN bị từ chối');
select t_err($$select public.app_state('fake-token-xxxxxxxxxxxxxxxxxxxx')$$, 'AUTH_REQUIRED', '01c token giả bị từ chối');

select t_eq((member_checkin(:'tan')->>'ok')::boolean, true, '02 check-in thành công');
select t_err(format($$select public.member_checkin(%L)$$, :'tan'), 'ALREADY_CHECKED_IN', '03 check-in lần 2 bị từ chối');
select t_eq((member_register_absence(:'thanh', 'work', null)->>'ok')::boolean, true, '04 vắng: công việc');
select t_eq((member_register_absence(:'tgiap', 'hometown', null)->>'ok')::boolean, true, '05 vắng: về quê');
select t_eq((member_register_absence(:'ttuan', 'sick', null)->>'ok')::boolean, true, '06 vắng: bị bệnh');
select t_err(format($$select public.member_register_absence(%L,'other','  ')$$, :'thoang'), 'REASON_NOTE_REQUIRED', '07a lý do khác phải nhập nội dung');
select t_eq((member_register_absence(:'thoang', 'other', 'Đi đám cưới')->>'ok')::boolean, true, '07 vắng: lý do khác');
select t_err($$select * from public.wallet_tx$$, 'permission denied', 'SEC đọc bảng trực tiếp bị chặn');
select t_err($$update public.members set name = 'hack'$$, 'permission denied', 'SEC sửa bảng trực tiếp bị chặn');
select t_err($$select public.admin_wallet_entry(gen_random_uuid(), 'deposit', 1000, 'x')$$, 'permission denied', 'SEC thành viên gọi hàm admin bị chặn');
select t_err($$select public._pay_penalty(1)$$, 'permission denied', 'SEC hàm nội bộ bị chặn');
reset role;

-- ================= THỨ BA 03/11 =================
update test_clock set t = '2026-11-03 09:00';
set role anon;
select app_state(:'tan') is not null;
reset role;
select t_eq((select count(*) from penalties)::int, 0, '04-07 Thứ Hai: không ai bị phạt (tập / có lý do)');
set role anon;
select member_checkin(:'tan') is not null;
select member_register_absence(:'thanh', 'work', null) is not null;
select member_checkin(:'thanh') is not null;                        -- đổi ý: vắng → đã tập
select member_register_absence(:'tgiap', 'work', null) is not null;
select member_register_absence(:'tgiap', 'sick', null) is not null; -- đổi lý do vắng trong ngày
select t_eq((member_request_deposit(:'ttuan', 100000, 'CK Vietcombank', 'k-tuan-1')->>'ok')::boolean, true, '11a xin nạp tiền');
select t_eq((member_request_deposit(:'ttuan', 100000, 'CK Vietcombank', 'k-tuan-1')->>'duplicate')::boolean, true, '11b bấm 2 lần không tạo giao dịch trùng');
select t_eq((select (x->>'balance')::int from jsonb_array_elements(app_state(:'ttuan')->'members') x where x->>'id' = :'tuan'), 0, '11c tiền chưa vào ví khi Admin chưa xác nhận');
reset role;
select t_eq((select count(*) from attendance_log where member_id = :'hanh' and day = '2026-11-03')::int, 2, 'LOG lưu lịch sử thay đổi');
select t_eq((select status from attendance where member_id = :'giap' and day = '2026-11-03'), 'excused', 'LOG chỉ 1 trạng thái cuối cùng');
-- Admin ghi nhận Hoàng đã nộp 200k
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_wallet_entry(:'hoang', 'deposit', 200000, 'Tiền mặt') is null;
reset request.jwt.claim.sub;
reset role;

-- ================= THỨ TƯ 04/11 (chốt Thứ Ba) =================
update test_clock set t = '2026-11-04 00:06';
select process_penalties();
select process_penalties();
select process_penalties();
select t_eq((select count(*) from penalties where day = '2026-11-03')::int, 2, '08 không tập & không lý do → bị phạt (Tuấn, Hoàng)');
select t_eq((select amount from penalties where member_id = :'tuan' and day = '2026-11-03'), 50000, '08b mức phạt 50.000đ');
select t_eq((select count(*) from penalties where member_id in (:'an', :'hanh', :'giap'))::int, 0, '04 có lý do / đã tập không bị phạt');
select t_eq((select count(*) from wallet_tx where type = 'penalty_payment' and member_id = :'hoang')::int, 1, '10 không bị trừ tiền 2 lần');
select t_eq(wallet_balance(:'hoang'), 150000, '10b ví Hoàng: 200k - 50k');
select t_eq((select paid from penalties where member_id = :'tuan' and day = '2026-11-03'), 0, '08c ví Tuấn chưa có tiền → nợ phạt');
select t_eq((select sum(amount) from fund_tx)::int, 50000, '12a quỹ chỉ cộng tiền phạt thực thu');
-- Né phạt: đăng ký lý do sau khi ngày đã kết thúc → chỉ áp dụng cho HÔM NAY
set role anon;
select member_register_absence(:'ttuan', 'sick', 'bổ sung hôm qua') is not null;
reset role;
select t_eq((select status from penalties where member_id = :'tuan' and day = '2026-11-03'), 'active', 'RULE không thể né phạt ngày đã qua');
-- Admin xác nhận khoản nạp 100k của Tuấn → tự trả nợ phạt
select id as dep from wallet_tx where member_id = :'tuan' and status = 'pending' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_decide_deposit(:dep, true) is null;
select t_err(format($$select public.admin_decide_deposit(%s, true)$$, :dep), 'NOT_PENDING', '11d không xác nhận 1 khoản 2 lần');
reset request.jwt.claim.sub;
reset role;
select t_eq(wallet_balance(:'tuan'), 50000, '11 nạp tiền sau khi Admin xác nhận');
select t_eq((select paid from penalties where member_id = :'tuan' and day = '2026-11-03'), 50000, '12b nợ phạt được thu khi có tiền');
select t_eq((select sum(amount) from fund_tx)::int, 100000, '12 quỹ = tổng phạt đã thu');
select t_err($$update public.wallet_tx set amount = 1 where id = 1$$, 'LEDGER_IMMUTABLE', 'SEC không sửa giao dịch cũ');
select t_err($$delete from public.fund_tx$$, 'LEDGER_IMMUTABLE', 'SEC không xóa giao dịch quỹ');

-- ================= Bỏ trống đến THỨ HAI 09/11 =================
update members set locked = true where id = :'an';     -- tài khoản khóa = tạm dừng, không phạt
update test_clock set t = '2026-11-09 08:00';
select process_penalties();
select t_eq((select count(*) from penalties where day = '2026-11-08')::int, 0, '09 Chủ nhật không bị phạt');
select t_eq((select count(*) from penalties where member_id = :'an')::int, 0, 'RULE tài khoản khóa không bị phạt');
-- 04/11 Tuấn đăng ký bệnh → không phạt; còn lại 04..07: Hạnh, Giáp, Hoàng 4 ngày, Tuấn 3 ngày
select t_eq((select count(*) from penalties where day between '2026-11-04' and '2026-11-07')::int, 15, '08d phạt đủ các ngày bắt buộc đã qua (xử lý bù)');
select t_eq((select count(*) from processed_days)::int, 7, 'RULE mỗi ngày chỉ chốt 1 lần');
update members set locked = false where id = :'an';

-- Admin miễn phạt hợp lệ cho Hoàng ngày 05/11 → hoàn tiền về ví
select wallet_balance(:'hoang') as hb \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000a0a0';
select admin_set_day(:'hoang', '2026-11-05', 'admin_excused', 'Đi công tác do công ty cử') is null;
reset request.jwt.claim.sub;
reset role;
select t_eq((select status from penalties where member_id = :'hoang' and day = '2026-11-05'), 'voided', 'ADMIN miễn phạt có nhật ký');
select t_eq(wallet_balance(:'hoang'), :hb + 50000, 'ADMIN hoàn tiền phạt về ví');
select t_eq((select count(*) from audit_log where action = 'day_adjust')::int, 1, 'ADMIN thao tác được ghi audit');

-- ================= Báo cáo tháng =================
select t_eq(month_mandatory_days('2026-11-01'), 25, '15a Tháng 11/2026: 30 ngày - 5 CN = 25 ngày bắt buộc');
select t_eq((select (x->>'trained')::int from jsonb_array_elements(month_report('2026-11-01')->'members') x where x->>'id' = :'an'), 2, '15b An tập 2 buổi');
select t_eq((select sum((x->>'penalty_total')::int) from jsonb_array_elements(month_report('2026-11-01')->'members') x)::int,
  (select sum(amount) from penalties where status = 'active')::int, '15c tổng phạt báo cáo khớp sổ phạt');
select t_eq((month_report('2026-11-01')->>'fund_balance')::int, (select sum(amount) from fund_tx)::int, '15d quỹ báo cáo khớp sổ quỹ');
-- Kiểm tra cân đối: tổng ví + quỹ = tổng tiền thật đã nộp
select t_eq(((select sum(amount) from wallet_tx where status='confirmed') + (select sum(amount) from fund_tx))::int,
  (select sum(amount) from wallet_tx where status='confirmed' and type='deposit')::int, '15e cân đối: ví + quỹ = tiền đã nộp');
