-- =====================================================================
-- GYM CHALLENGE — 005: KÝ QUỸ THÁNG + thông tin nhận tiền + khóa báo vắng sau khi đã tập
--  • Tiền tham gia = KÝ QUỸ nằm trong ví thành viên (không chuyển vào quỹ).
--  • Mỗi tháng: ký quỹ yêu cầu R = phí × (ngày bắt buộc của bạn / ngày bắt buộc của tháng).
--    Số dư còn lại tháng trước được tính vào → chỉ cần nạp thêm T = R − số dư (≥ 0).
--  • Phạm luật: 50.000đ trừ từ ví (ký quỹ) → cộng vào QUỸ NHÓM.
--  • Đã check-in "đã tập" thì không đổi sang báo vắng được nữa.
-- An toàn khi chạy lại.
-- =====================================================================

alter table public.dues add column if not exists required int not null default 0;
alter table public.settings add column if not exists treasurer text not null default '';
alter table public.settings add column if not exists pay_bank text not null default '';
alter table public.settings add column if not exists pay_account text not null default '';
alter table public.settings add column if not exists pay_name text not null default '';

-- Ghi nhận ký quỹ tháng hiện tại (chỉ là nghĩa vụ nạp, KHÔNG di chuyển tiền)
create or replace function public._charge_dues() returns int
language plpgsql security definer set search_path = public as $$
declare s settings%rowtype; m0 date := date_trunc('month', vn_today())::date; r record; f jsonb; rq int; bal int; n int := 0;
begin
  select * into s from settings where id = 1;
  if s.monthly_fee <= 0 or vn_today() < s.challenge_start then return 0; end if;
  for r in select id from members where deleted_at is null and not locked and joined_on <= vn_today()
    and not exists (select 1 from dues d where d.member_id = members.id and d.month = m0)
  loop
    f := fee_for(r.id, m0);
    rq := (f->>'amount')::int;
    if rq > 0 then
      bal := greatest(wallet_balance(r.id), 0);
      insert into dues(member_id, month, required, amount, paid, member_days, month_days)
        values (r.id, m0, rq, greatest(rq - bal, 0), 0, (f->>'member_days')::int, (f->>'month_days')::int)
        on conflict (member_id, month) do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Nạp tiền được xác nhận → tính vào phần ký quỹ còn thiếu của tháng
create or replace function public._apply_deposit(p_member uuid, p_amount int) returns void
language sql security definer set search_path = public as $$
  update dues set paid = least(amount, paid + greatest(p_amount, 0))
  where member_id = p_member and month = date_trunc('month', vn_today())::date and status = 'active'
$$;

-- Trả nợ phạt từ ví (ký quỹ không di chuyển tiền nên chỉ còn tiền phạt)
create or replace function public._settle_outstanding(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from penalties where member_id = p_member and status = 'active' and paid < amount order by day loop
    exit when wallet_balance(p_member) <= 0;
    perform _pay_penalty(r.id);
  end loop;
end $$;

create or replace function public.admin_decide_deposit(p_id bigint, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); w wallet_tx%rowtype;
begin
  select * into w from wallet_tx where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  update wallet_tx set status = case when p_approve then 'confirmed' else 'rejected' end, decided_by = a, decided_at = now() where id = p_id;
  insert into audit_log(actor, action, details) values (a, case when p_approve then 'deposit_confirm' else 'deposit_reject' end,
    jsonb_build_object('id', p_id, 'member_id', w.member_id, 'amount', w.amount, 'note', p_note));
  if p_approve then
    perform _charge_dues();
    perform _apply_deposit(w.member_id, w.amount);
    perform _settle_outstanding(w.member_id);
  end if;
end $$;

create or replace function public.admin_wallet_entry(p_member uuid, p_type text, p_amount int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin();
begin
  if p_type not in ('deposit','adjustment') then raise exception 'TYPE_INVALID'; end if;
  if p_amount = 0 or (p_type = 'deposit' and p_amount < 0) then raise exception 'AMOUNT_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  insert into wallet_tx(member_id, type, amount, status, note, created_by, decided_by, decided_at)
    values (p_member, p_type, p_amount, 'confirmed', p_note, a, a, now());
  insert into audit_log(actor, action, details) values (a, 'wallet_entry', jsonb_build_object('member_id', p_member, 'type', p_type, 'amount', p_amount, 'note', p_note));
  if p_type = 'deposit' then perform _charge_dues(); perform _apply_deposit(p_member, p_amount); end if;
  if p_amount > 0 then perform _settle_outstanding(p_member); end if;
end $$;

-- Miễn ký quỹ tháng (nếu có khoản phí cũ đã bị trừ theo cách tính trước → hoàn về ví)
create or replace function public.admin_void_due(p_member uuid, p_month date, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); d dues%rowtype; taken int;
begin
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  select * into d from dues where member_id = p_member and month = date_trunc('month', p_month)::date and status = 'active' for update;
  if not found then raise exception 'NO_DUE'; end if;
  select coalesce(-sum(amount), 0) into taken from wallet_tx where due_id = d.id and type = 'fee_payment';
  if taken > 0 then
    insert into wallet_tx(member_id, type, amount, status, due_id, note, created_by) values (p_member, 'refund', taken, 'confirmed', d.id, 'Hoàn phí tháng ' || to_char(d.month, 'MM/YYYY'), a);
    insert into fund_tx(type, amount, member_id, due_id, note, created_by) values ('refund', -taken, p_member, d.id, 'Hoàn phí tháng ' || to_char(d.month, 'MM/YYYY'), a);
  end if;
  update dues set status = 'voided', voided_at = now(), void_reason = p_note where id = d.id;
  insert into audit_log(actor, action, details) values (a, 'due_void', jsonb_build_object('member_id', p_member, 'month', d.month, 'note', p_note));
end $$;

-- Đã tập thì không đổi sang báo vắng
create or replace function public.member_register_absence(p_token text, p_reason text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid := member_from_token(p_token); today date := vn_today(); old text; note text := nullif(trim(coalesce(p_note,'')), '');
begin
  perform pg_advisory_xact_lock(hashtext('att:' || mid::text));
  perform process_penalties();
  if p_reason not in ('work','hometown','sick','other') then raise exception 'REASON_INVALID'; end if;
  if p_reason = 'other' and note is null then raise exception 'REASON_NOTE_REQUIRED'; end if;
  if not is_mandatory(today) then raise exception 'NOT_MANDATORY_DAY'; end if;
  select status into old from attendance where member_id = mid and day = today for update;
  if old = 'trained' then raise exception 'ALREADY_TRAINED'; end if;
  if old = 'admin_excused' then raise exception 'ALREADY_EXCUSED'; end if;
  insert into attendance(member_id, day, status, reason, reason_note, checked_in_at, updated_at)
    values (mid, today, 'excused', p_reason, note, null, now())
    on conflict (member_id, day) do update
      set status = 'excused', reason = p_reason, reason_note = note, checked_in_at = null, updated_at = now();
  insert into attendance_log(member_id, day, old_status, new_status, reason, reason_note, actor)
    values (mid, today, old, 'excused', p_reason, note, 'member');
  return jsonb_build_object('ok', true, 'day', today);
end $$;

create or replace function public.admin_update_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); old jsonb;
begin
  select to_jsonb(s) into old from settings s where id = 1;
  if p ? 'join_code' and length(_norm_code(p->>'join_code')) < 4 then raise exception 'JOIN_CODE_SHORT'; end if;
  update settings set
    penalty_amount  = coalesce((p->>'penalty_amount')::int, penalty_amount),
    monthly_fee     = coalesce((p->>'monthly_fee')::int, monthly_fee),
    workdays        = coalesce((select array_agg(x::int order by x::int) from jsonb_array_elements_text(p->'workdays') x), workdays),
    off_dates       = case when p ? 'off_dates' then coalesce((select array_agg(x::date order by x::date) from jsonb_array_elements_text(p->'off_dates') x), '{}') else off_dates end,
    checkin_start   = coalesce((p->>'checkin_start')::time, checkin_start),
    checkin_end     = coalesce((p->>'checkin_end')::time, checkin_end),
    challenge_start = coalesce((p->>'challenge_start')::date, challenge_start),
    allow_self_join = coalesce((p->>'allow_self_join')::boolean, allow_self_join),
    join_code       = coalesce(nullif(_norm_code(p->>'join_code'), ''), join_code),
    treasurer       = coalesce(left(trim(p->>'treasurer'), 60), treasurer),
    pay_bank        = coalesce(left(upper(trim(p->>'pay_bank')), 20), pay_bank),
    pay_account     = coalesce(left(regexp_replace(p->>'pay_account', '[^0-9]', '', 'g'), 30), pay_account),
    pay_name        = coalesce(left(upper(trim(p->>'pay_name')), 60), pay_name),
    updated_at      = now()
  where id = 1;
  insert into audit_log(actor, action, details) values (a, 'settings_update', jsonb_build_object('old', old - 'join_code', 'new', p - 'join_code'));
  perform _charge_dues();
end $$;

-- Báo cáo: ký quỹ yêu cầu / đã nạp
create or replace function public.month_report(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 date := date_trunc('month', p_month)::date; m1 date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  return jsonb_build_object(
    'month', m0,
    'mandatory_days', month_mandatory_days(m0),
    'mandatory_days_elapsed', (select count(*) from generate_series(m0, least(m1, vn_today()), interval '1 day') g(d) where is_mandatory(g.d::date)),
    'monthly_fee', (select monthly_fee from settings where id = 1),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'color', m.color, 'joined_on', m.joined_on,
        'member_days', member_month_days(m.id, m0),
        'trained', (select count(*) from attendance a where a.member_id = m.id and a.status = 'trained' and a.day between m0 and m1),
        'excused', (select count(*) from attendance a where a.member_id = m.id and a.status in ('excused','admin_excused') and a.day between m0 and m1),
        'penalized', (select count(*) from penalties p where p.member_id = m.id and p.status = 'active' and p.day between m0 and m1),
        'penalty_total', (select coalesce(sum(amount),0) from penalties p where p.member_id = m.id and p.status = 'active' and p.day between m0 and m1),
        'fee', (select coalesce(sum(greatest(required, amount)),0) from dues d where d.member_id = m.id and d.status = 'active' and d.month = m0),
        'fee_topup', (select coalesce(sum(amount),0) from dues d where d.member_id = m.id and d.status = 'active' and d.month = m0),
        'fee_paid', (select coalesce(sum(paid),0) from dues d where d.member_id = m.id and d.status = 'active' and d.month = m0),
        'deposited', (select coalesce(sum(amount),0) from wallet_tx w where w.member_id = m.id and w.type = 'deposit' and w.status = 'confirmed'
                      and (w.decided_at at time zone 'Asia/Ho_Chi_Minh')::date between m0 and m1),
        'balance', wallet_balance(m.id)
      ) order by m.created_at, m.name)
      from members m where m.deleted_at is null), '[]'),
    'fund_balance', (select coalesce(sum(amount),0) from fund_tx),
    'fund_penalty_month', (select coalesce(sum(paid),0) from penalties where status='active' and day between m0 and m1)
  );
end $$;

revoke execute on function public._apply_deposit(uuid, int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public._apply_deposit(uuid, int), public._charge_dues(), public._settle_outstanding(uuid) from anon, authenticated;
    grant execute on function public.admin_decide_deposit(bigint, boolean, text), public.admin_wallet_entry(uuid, text, int, text),
      public.admin_void_due(uuid, date, text), public.admin_update_settings(jsonb) to authenticated;
    grant execute on function public.member_register_absence(text, text, text) to anon, authenticated;
  end if;
end $$;
