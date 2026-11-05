-- =====================================================================
-- GYM CHALLENGE — 004: PHÍ THAM GIA THÁNG tính theo số ngày tham gia
-- Người vào giữa tháng chỉ đóng phần ngày bắt buộc còn lại:
--   phí = phí tháng × (ngày bắt buộc của bạn trong tháng / ngày bắt buộc của tháng), làm tròn 1.000đ
-- Thu tự động từ ví vào quỹ (thiếu thì ghi nợ, nạp tiền sẽ tự trả). An toàn khi chạy lại.
-- =====================================================================

alter table public.settings add column if not exists monthly_fee int not null default 0 check (monthly_fee >= 0);

create table if not exists public.dues (
  id             bigserial primary key,
  member_id      uuid not null references public.members(id) on delete cascade,
  month          date not null check (month = date_trunc('month', month)::date),
  amount         int not null check (amount >= 0),
  paid           int not null default 0 check (paid >= 0),
  member_days    int not null,
  month_days     int not null,
  status         text not null default 'active' check (status in ('active','voided')),
  void_reason    text,
  created_at     timestamptz not null default now(),
  voided_at      timestamptz,
  unique (member_id, month),
  check (paid <= amount)
);
alter table public.dues enable row level security;
alter table public.dues force row level security;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.dues from anon, authenticated; end if;
end $$;

alter table public.wallet_tx add column if not exists due_id bigint references public.dues(id);
alter table public.fund_tx   add column if not exists due_id bigint references public.dues(id);
alter table public.wallet_tx drop constraint if exists wallet_tx_type_check;
alter table public.wallet_tx add constraint wallet_tx_type_check check (type in ('deposit','penalty_payment','fee_payment','refund','adjustment'));
alter table public.fund_tx drop constraint if exists fund_tx_type_check;
alter table public.fund_tx add constraint fund_tx_type_check check (type in ('penalty_income','fee_income','contribution','expense','refund','adjustment'));

-- Số ngày bắt buộc của 1 thành viên trong tháng (tính từ ngày tham gia)
create or replace function public.member_month_days(p_member uuid, p_month date) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from members m,
    generate_series(date_trunc('month', p_month)::date, (date_trunc('month', p_month) + interval '1 month - 1 day')::date, interval '1 day') g(d)
  where m.id = p_member and g.d::date >= m.joined_on and is_mandatory(g.d::date)
$$;

create or replace function public.fee_for(p_member uuid, p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fee int; md int; td int;
begin
  select monthly_fee into fee from settings where id = 1;
  td := month_mandatory_days(p_month);
  md := member_month_days(p_member, p_month);
  return jsonb_build_object('fee_full', fee, 'member_days', md, 'month_days', td,
    'amount', case when td = 0 or fee = 0 then 0 else (round(fee::numeric * md / td / 1000) * 1000)::int end);
end $$;

create or replace function public._pay_due(p_due bigint) returns int
language plpgsql security definer set search_path = public as $$
declare d dues%rowtype; bal int; pay int; lbl text;
begin
  select * into d from dues where id = p_due for update;
  if d.status <> 'active' or d.paid >= d.amount then return 0; end if;
  bal := wallet_balance(d.member_id);
  pay := least(greatest(bal, 0), d.amount - d.paid);
  if pay <= 0 then return 0; end if;
  lbl := 'Phí tháng ' || to_char(d.month, 'MM/YYYY') || ' (' || d.member_days || '/' || d.month_days || ' ngày)';
  insert into wallet_tx(member_id, type, amount, status, due_id, note, created_by) values (d.member_id, 'fee_payment', -pay, 'confirmed', d.id, lbl, 'system');
  insert into fund_tx(type, amount, member_id, due_id, note, created_by) values ('fee_income', pay, d.member_id, d.id, lbl, 'system');
  update dues set paid = paid + pay where id = d.id;
  return pay;
end $$;

-- Trả nợ theo thứ tự thời gian (phí tháng tính vào ngày 1 của tháng, phạt theo ngày)
create or replace function public._settle_outstanding(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select 'due' k, id, month as d from dues where member_id = p_member and status = 'active' and paid < amount
    union all
    select 'pen', id, day from penalties where member_id = p_member and status = 'active' and paid < amount
    order by d, k desc
  loop
    exit when wallet_balance(p_member) <= 0;
    if r.k = 'due' then perform _pay_due(r.id); else perform _pay_penalty(r.id); end if;
  end loop;
end $$;

-- Thu phí tháng hiện tại cho mọi thành viên đang hoạt động (1 lần / người / tháng)
create or replace function public._charge_dues() returns int
language plpgsql security definer set search_path = public as $$
declare s settings%rowtype; m0 date := date_trunc('month', vn_today())::date; r record; f jsonb; did bigint; n int := 0;
begin
  select * into s from settings where id = 1;
  if s.monthly_fee <= 0 or vn_today() < s.challenge_start then return 0; end if;
  for r in select id from members where deleted_at is null and not locked and joined_on <= vn_today()
    and not exists (select 1 from dues d where d.member_id = members.id and d.month = m0)
  loop
    f := fee_for(r.id, m0);
    if (f->>'amount')::int > 0 then
      insert into dues(member_id, month, amount, member_days, month_days)
        values (r.id, m0, (f->>'amount')::int, (f->>'member_days')::int, (f->>'month_days')::int)
        on conflict (member_id, month) do nothing returning id into did;
      if did is not null then perform _pay_due(did); n := n + 1; end if;
      did := null;
    end if;
  end loop;
  return n;
end $$;

-- process_penalties: thêm bước thu phí tháng (vẫn idempotent, có khóa)
create or replace function public.process_penalties() returns int
language plpgsql security definer set search_path = public as $$
declare s settings%rowtype; d date; last_done date; total int := 0; n int; r record; pid bigint;
begin
  if not pg_try_advisory_xact_lock(424242) then return 0; end if;
  select * into s from settings where id = 1;
  select max(day) into last_done from processed_days;
  d := greatest(coalesce(last_done + 1, s.challenge_start), s.challenge_start);
  while d < vn_today() loop
    n := 0;
    if is_mandatory(d) then
      for r in
        select m.id from members m
        where m.deleted_at is null and not m.locked and m.joined_on <= d
          and not exists (select 1 from attendance a where a.member_id = m.id and a.day = d)
      loop
        insert into penalties(member_id, day, amount) values (r.id, d, s.penalty_amount)
          on conflict (member_id, day) do nothing returning id into pid;
        if pid is not null then perform _pay_penalty(pid); n := n + 1; end if;
        pid := null;
      end loop;
    end if;
    insert into processed_days(day, penalties) values (d, n) on conflict (day) do nothing;
    total := total + n;
    d := d + 1;
  end loop;
  perform _charge_dues();
  return total;
end $$;

-- Admin miễn phí tháng (hoàn phần đã thu về ví)
create or replace function public.admin_void_due(p_member uuid, p_month date, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); d dues%rowtype; lbl text;
begin
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  select * into d from dues where member_id = p_member and month = date_trunc('month', p_month)::date and status = 'active' for update;
  if not found then raise exception 'NO_DUE'; end if;
  lbl := 'Hoàn phí tháng ' || to_char(d.month, 'MM/YYYY');
  if d.paid > 0 then
    insert into wallet_tx(member_id, type, amount, status, due_id, note, created_by) values (p_member, 'refund', d.paid, 'confirmed', d.id, lbl, a);
    insert into fund_tx(type, amount, member_id, due_id, note, created_by) values ('refund', -d.paid, p_member, d.id, lbl, a);
  end if;
  update dues set status = 'voided', voided_at = now(), void_reason = p_note where id = d.id;
  insert into audit_log(actor, action, details) values (a, 'due_void', jsonb_build_object('member_id', p_member, 'month', d.month, 'note', p_note));
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
    updated_at      = now()
  where id = 1;
  insert into audit_log(actor, action, details) values (a, 'settings_update', jsonb_build_object('old', old - 'join_code', 'new', p - 'join_code'));
  perform _charge_dues();
end $$;

-- Báo cáo tháng: thêm phí tháng
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
        'fee', (select coalesce(sum(amount),0) from dues d where d.member_id = m.id and d.status = 'active' and d.month = m0),
        'fee_paid', (select coalesce(sum(paid),0) from dues d where d.member_id = m.id and d.status = 'active' and d.month = m0),
        'balance', wallet_balance(m.id)
      ) order by m.created_at, m.name)
      from members m where m.deleted_at is null), '[]'),
    'fund_balance', (select coalesce(sum(amount),0) from fund_tx),
    'fund_penalty_month', (select coalesce(sum(paid),0) from penalties where status='active' and day between m0 and m1),
    'fund_fee_month', (select coalesce(sum(paid),0) from dues where status='active' and month = m0)
  );
end $$;

-- app_state: thêm phí tháng, nợ gồm cả phí
create or replace function public.app_state(p_token text, p_month date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid; admin boolean := is_admin(); today date := vn_today();
  m0 date; m1 date; cur date := date_trunc('month', vn_today())::date; result jsonb;
begin
  if not admin then me := member_from_token(p_token); end if;
  perform process_penalties();
  m0 := date_trunc('month', coalesce(p_month, today))::date;
  m1 := (m0 + interval '1 month - 1 day')::date;

  select jsonb_build_object(
    'server_now', now(), 'today', today, 'today_mandatory', is_mandatory(today),
    'me', me, 'is_admin', admin, 'month', m0,
    'settings', (select to_jsonb(s) - 'id' from settings s where id = 1),
    'month_days', month_mandatory_days(cur),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'color', m.color, 'locked', m.locked, 'joined_on', m.joined_on,
        'has_pin', m.pin_hash is not null,
        'sessions_total', (select count(*) from attendance a where a.member_id = m.id and a.status = 'trained'),
        'excused_total', (select count(*) from attendance a where a.member_id = m.id and a.status in ('excused','admin_excused')),
        'penalized_total', (select count(*) from penalties p where p.member_id = m.id and p.status = 'active'),
        'penalty_amount_total', (select coalesce(sum(amount),0) from penalties p where p.member_id = m.id and p.status = 'active'),
        'fee_total', (select coalesce(sum(amount),0) from dues d where d.member_id = m.id and d.status = 'active'),
        'deposited_total', (select coalesce(sum(amount),0) from wallet_tx w where w.member_id = m.id and w.status='confirmed' and w.type='deposit'),
        'outstanding', (select coalesce(sum(amount - paid),0) from penalties p where p.member_id = m.id and p.status = 'active')
                     + (select coalesce(sum(amount - paid),0) from dues d where d.member_id = m.id and d.status = 'active'),
        'balance', wallet_balance(m.id),
        'streak', (select current_streak from member_streaks(m.id)),
        'best_streak', (select longest_streak from member_streaks(m.id)),
        'fee_month', (select jsonb_build_object('amount', d.amount, 'paid', d.paid, 'member_days', d.member_days, 'month_days', d.month_days, 'status', d.status)
                      from dues d where d.member_id = m.id and d.month = cur),
        'fee_preview', fee_for(m.id, cur),
        'today', (select jsonb_build_object('status', a.status, 'reason', a.reason, 'note', a.reason_note, 'at', a.checked_in_at)
                  from attendance a where a.member_id = m.id and a.day = today)
      ) order by m.created_at, m.name)
      from members m where m.deleted_at is null), '[]'),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', a.member_id, 'day', a.day, 'status', a.status,
        'reason', a.reason, 'note', a.reason_note, 'at', a.checked_in_at) order by a.day)
      from attendance a where a.day between m0 and m1), '[]'),
    'penalties', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'member_id', p.member_id, 'day', p.day, 'amount', p.amount,
        'paid', p.paid, 'status', p.status, 'void_reason', p.void_reason) order by p.day)
      from penalties p where p.day between m0 and m1), '[]'),
    'dues', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'member_id', d.member_id, 'month', d.month, 'amount', d.amount,
        'paid', d.paid, 'member_days', d.member_days, 'month_days', d.month_days, 'status', d.status, 'void_reason', d.void_reason))
      from dues d where d.month = m0), '[]'),
    'wallet_tx', coalesce((
      select jsonb_agg(x order by (x->>'id')::bigint desc) from (
        select jsonb_build_object('id', w.id, 'member_id', w.member_id, 'type', w.type, 'amount', w.amount,
          'status', w.status, 'note', w.note, 'created_at', w.created_at, 'decided_at', w.decided_at, 'created_by', w.created_by) x
        from wallet_tx w where admin or w.member_id = me order by w.id desc limit 500) t), '[]'),
    'fund', jsonb_build_object(
      'balance', (select coalesce(sum(amount),0) from fund_tx),
      'penalty_collected', (select coalesce(sum(amount),0) from fund_tx where type = 'penalty_income')
                          + (select coalesce(sum(amount),0) from fund_tx where type = 'refund' and penalty_id is not null),
      'penalty_uncollected', (select coalesce(sum(amount - paid),0) from penalties where status='active'),
      'fee_collected', (select coalesce(sum(amount),0) from fund_tx where type = 'fee_income')
                      + (select coalesce(sum(amount),0) from fund_tx where type = 'refund' and due_id is not null),
      'fee_uncollected', (select coalesce(sum(amount - paid),0) from dues where status='active'),
      'contributions', (select coalesce(sum(amount),0) from fund_tx where type = 'contribution'),
      'expenses', (select coalesce(-sum(amount),0) from fund_tx where type = 'expense'),
      'penalty_month', (select coalesce(sum(amount),0) from penalties where status='active' and day between m0 and m1)
    ),
    'fund_tx', coalesce((
      select jsonb_agg(x order by (x->>'id')::bigint desc) from (
        select jsonb_build_object('id', f.id, 'type', f.type, 'amount', f.amount, 'member_id', f.member_id,
          'note', f.note, 'created_at', f.created_at) x
        from fund_tx f order by f.id desc limit 300) t), '[]'),
    'report', month_report(m0),
    'closing', (select jsonb_build_object('closed_at', c.closed_at, 'closed_by', c.closed_by, 'snapshot', c.snapshot)
                from month_closings c where c.month = m0),
    'closed_months', coalesce((select jsonb_agg(month order by month desc) from month_closings), '[]'),
    'first_month', (select date_trunc('month', challenge_start)::date from settings where id = 1)
  ) into result;
  return result;
end $$;

-- Quyền
revoke execute on function public._pay_due(bigint), public._charge_dues(), public._settle_outstanding(uuid),
  public.member_month_days(uuid, date), public.fee_for(uuid, date) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public._pay_due(bigint), public._charge_dues(), public._settle_outstanding(uuid),
      public.member_month_days(uuid, date), public.fee_for(uuid, date), public.month_report(date) from anon, authenticated;
    grant execute on function public.app_state(text, date), public.process_penalties() to anon, authenticated;
    grant execute on function public.admin_void_due(uuid, date, text), public.admin_update_settings(jsonb) to authenticated;
  end if;
end $$;

-- Thông tin cho màn hình "Tham gia nhóm": phí tháng nếu vào hôm nay
create or replace function public.join_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('allow_self_join', s.allow_self_join, 'monthly_fee', s.monthly_fee,
    'month_days', month_mandatory_days(vn_today()),
    'days_left', (select count(*) from generate_series(vn_today(), (date_trunc('month', vn_today()) + interval '1 month - 1 day')::date, interval '1 day') g(d) where is_mandatory(g.d::date)),
    'fee_if_join_today', case when s.monthly_fee = 0 or month_mandatory_days(vn_today()) = 0 then 0 else
      (round(s.monthly_fee::numeric * (select count(*) from generate_series(vn_today(), (date_trunc('month', vn_today()) + interval '1 month - 1 day')::date, interval '1 day') g(d) where is_mandatory(g.d::date))
        / month_mandatory_days(vn_today()) / 1000) * 1000)::int end)
  from settings s where s.id = 1
$$;

-- Sửa: "Xóa trạng thái" một ngày đã được miễn và đã hoàn tiền → tính phạt lại đúng
create or replace function public.admin_set_day(p_member uuid, p_day date, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); old text; pid bigint;
begin
  if p_status not in ('trained','admin_excused','clear') then raise exception 'STATUS_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  if p_day > vn_today() then raise exception 'FUTURE_DAY'; end if;
  perform pg_advisory_xact_lock(hashtext('att:' || p_member::text));
  select status into old from attendance where member_id = p_member and day = p_day for update;
  if p_status = 'clear' then
    delete from attendance where member_id = p_member and day = p_day;
    if p_day < vn_today() and is_mandatory(p_day) and exists (select 1 from processed_days where day = p_day) then
      update penalties set status = 'active', paid = 0, voided_at = null, void_reason = null
        where member_id = p_member and day = p_day and status = 'voided' returning id into pid;
      if pid is null and not exists (select 1 from penalties where member_id = p_member and day = p_day) then
        insert into penalties(member_id, day, amount) values (p_member, p_day, (select penalty_amount from settings where id=1)) returning id into pid;
      end if;
      if pid is not null then perform _pay_penalty(pid); end if;
    end if;
  else
    insert into attendance(member_id, day, status, reason, reason_note, checked_in_at, updated_at)
      values (p_member, p_day, p_status, null, p_note, case when p_status = 'trained' then now() end, now())
      on conflict (member_id, day) do update set status = excluded.status, reason = null, reason_note = excluded.reason_note,
        checked_in_at = excluded.checked_in_at, updated_at = now();
    perform _void_penalty(p_member, p_day, p_note, a);
  end if;
  insert into attendance_log(member_id, day, old_status, new_status, reason_note, actor)
    values (p_member, p_day, old, nullif(p_status,'clear'), p_note, a);
  insert into audit_log(actor, action, details) values (a, 'day_adjust', jsonb_build_object('member_id', p_member, 'day', p_day, 'old', old, 'new', p_status, 'note', p_note));
end $$;
