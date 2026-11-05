-- =====================================================================
-- GYM CHALLENGE — Supabase schema, RLS, business logic
-- Chạy 1 lần trong Supabase → SQL Editor (an toàn khi chạy lại).
-- Toàn bộ thao tác ghi đều đi qua hàm SECURITY DEFINER; bảng bị khóa RLS.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id               int primary key default 1 check (id = 1),
  penalty_amount   int  not null default 50000 check (penalty_amount >= 0),
  workdays         int[] not null default '{1,2,3,4,5,6}',   -- ISO: 1=T2 ... 7=CN
  off_dates        date[] not null default '{}',              -- ngày nghỉ lễ thêm
  checkin_start    time not null default '00:00',
  checkin_end      time not null default '23:59:59',
  challenge_start  date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  updated_at       timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  color       text not null default '#39FF88',
  pin_hash    text,
  locked      boolean not null default false,
  joined_on   date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  deleted_at  timestamptz,
  failed_pins int not null default 0,
  pin_locked_until timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists members_name_uq on public.members (lower(name)) where deleted_at is null;

create table if not exists public.member_sessions (
  token_hash  text primary key,
  member_id   uuid not null references public.members(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '180 days'
);

-- Trạng thái CUỐI CÙNG của mỗi người / mỗi ngày (khóa chính chống trùng)
create table if not exists public.attendance (
  member_id     uuid not null references public.members(id) on delete cascade,
  day           date not null,
  status        text not null check (status in ('trained','excused','admin_excused')),
  reason        text check (reason in ('work','hometown','sick','other')),
  reason_note   text,
  checked_in_at timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (member_id, day),
  check (status <> 'excused' or reason is not null),
  check (reason is distinct from 'other' or status <> 'excused' or length(trim(coalesce(reason_note,''))) > 0)
);

create table if not exists public.attendance_log (
  id          bigserial primary key,
  member_id   uuid not null references public.members(id) on delete cascade,
  day         date not null,
  old_status  text,
  new_status  text,
  reason      text,
  reason_note text,
  actor       text not null,       -- 'member' | 'admin:<email>'
  at          timestamptz not null default now()
);

create table if not exists public.penalties (
  id          bigserial primary key,
  member_id   uuid not null references public.members(id) on delete cascade,
  day         date not null,
  amount      int not null check (amount >= 0),
  paid        int not null default 0 check (paid >= 0),
  status      text not null default 'active' check (status in ('active','voided')),
  void_reason text,
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  unique (member_id, day),                     -- 1 lần / người / ngày
  check (paid <= amount)
);

create table if not exists public.wallet_tx (
  id              bigserial primary key,
  member_id       uuid not null references public.members(id) on delete cascade,
  type            text not null check (type in ('deposit','penalty_payment','refund','adjustment')),
  amount          int not null,                -- dương: vào ví, âm: ra ví
  status          text not null default 'confirmed' check (status in ('pending','confirmed','rejected')),
  penalty_id      bigint references public.penalties(id),
  note            text,
  idempotency_key text unique,
  created_by      text not null,
  decided_by      text,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz
);
create index if not exists wallet_tx_member on public.wallet_tx(member_id, status);

create table if not exists public.fund_tx (
  id          bigserial primary key,
  type        text not null check (type in ('penalty_income','contribution','expense','refund','adjustment')),
  amount      int not null,
  member_id   uuid references public.members(id) on delete set null,
  penalty_id  bigint references public.penalties(id),
  note        text,
  created_by  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.processed_days (
  day          date primary key,
  processed_at timestamptz not null default now(),
  penalties    int not null default 0
);

create table if not exists public.audit_log (
  id      bigserial primary key,
  actor   text not null,
  action  text not null,
  details jsonb,
  at      timestamptz not null default now()
);

create table if not exists public.admins (
  user_id uuid primary key,
  email   text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.month_closings (
  month     date primary key,
  closed_at timestamptz not null default now(),
  closed_by text not null,
  snapshot  jsonb not null
);

-- ---------------------------------------------------------------------
-- Sổ cái bất biến: không sửa / xóa giao dịch cũ
-- ---------------------------------------------------------------------
create or replace function public.tg_ledger_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'LEDGER_IMMUTABLE';
  end if;
  if tg_table_name = 'wallet_tx' then
    -- chỉ cho phép: pending -> confirmed/rejected, các cột khác giữ nguyên
    if old.status = 'pending' and new.status in ('confirmed','rejected')
       and new.amount = old.amount and new.member_id = old.member_id and new.type = old.type then
      return new;
    end if;
  end if;
  raise exception 'LEDGER_IMMUTABLE';
end $$;

drop trigger if exists wallet_tx_guard on public.wallet_tx;
create trigger wallet_tx_guard before update or delete on public.wallet_tx
  for each row execute function public.tg_ledger_guard();
drop trigger if exists fund_tx_guard on public.fund_tx;
create trigger fund_tx_guard before update or delete on public.fund_tx
  for each row execute function public.tg_ledger_guard();
drop trigger if exists attendance_log_guard on public.attendance_log;
create trigger attendance_log_guard before update or delete on public.attendance_log
  for each row execute function public.tg_ledger_guard();
drop trigger if exists audit_log_guard on public.audit_log;
create trigger audit_log_guard before update or delete on public.audit_log
  for each row execute function public.tg_ledger_guard();

-- ---------------------------------------------------------------------
-- RLS: bật cho mọi bảng, KHÔNG có policy → client không đọc/ghi trực tiếp
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','members','member_sessions','attendance','attendance_log',
    'penalties','wallet_tx','fund_tx','processed_days','audit_log','admins','month_closings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.vn_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh') $$;

create or replace function public.vn_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Ho_Chi_Minh')::date $$;

create or replace function public.is_mandatory(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from d)::int = any(s.workdays)
     and not (d = any(s.off_dates))
     and d >= s.challenge_start
  from settings s where s.id = 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

create or replace function public.admin_actor() returns text
language plpgsql stable security definer set search_path = public as $$
declare e text;
begin
  select email into e from admins where user_id = auth.uid();
  if e is null then raise exception 'NOT_ADMIN'; end if;
  return 'admin:' || e;
end $$;

create or replace function public.require_admin() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  return admin_actor();
end $$;

create or replace function public.member_from_token(p_token text) returns uuid
language plpgsql stable security definer set search_path = public, extensions as $$
declare m uuid;
begin
  if p_token is null or length(p_token) < 20 then raise exception 'AUTH_REQUIRED'; end if;
  select s.member_id into m
  from member_sessions s join members mb on mb.id = s.member_id
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.expires_at > now() and mb.deleted_at is null and not mb.locked;
  if m is null then raise exception 'AUTH_REQUIRED'; end if;
  return m;
end $$;

create or replace function public.wallet_balance(p_member uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int from wallet_tx where member_id = p_member and status = 'confirmed'
$$;

-- Trả phạt từ ví (nếu đủ tiền), cộng vào quỹ. Gọi nội bộ.
create or replace function public._pay_penalty(p_penalty bigint) returns int
language plpgsql security definer set search_path = public as $$
declare pen penalties%rowtype; bal int; pay int;
begin
  select * into pen from penalties where id = p_penalty for update;
  if pen.status <> 'active' or pen.paid >= pen.amount then return 0; end if;
  bal := wallet_balance(pen.member_id);
  pay := least(greatest(bal, 0), pen.amount - pen.paid);
  if pay <= 0 then return 0; end if;
  insert into wallet_tx(member_id, type, amount, status, penalty_id, note, created_by)
    values (pen.member_id, 'penalty_payment', -pay, 'confirmed', pen.id, 'Phạt ngày ' || to_char(pen.day,'DD/MM/YYYY'), 'system');
  insert into fund_tx(type, amount, member_id, penalty_id, note, created_by)
    values ('penalty_income', pay, pen.member_id, pen.id, 'Phạt ngày ' || to_char(pen.day,'DD/MM/YYYY'), 'system');
  update penalties set paid = paid + pay where id = pen.id;
  return pay;
end $$;

create or replace function public._settle_outstanding(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from penalties where member_id = p_member and status = 'active' and paid < amount order by day loop
    exit when wallet_balance(p_member) <= 0;
    perform _pay_penalty(r.id);
  end loop;
end $$;

-- Hủy phạt (điều chỉnh hợp lệ của Admin): hoàn tiền đã thu về ví
create or replace function public._void_penalty(p_member uuid, p_day date, p_reason text, p_actor text) returns void
language plpgsql security definer set search_path = public as $$
declare pen penalties%rowtype;
begin
  select * into pen from penalties where member_id = p_member and day = p_day and status = 'active' for update;
  if not found then return; end if;
  if pen.paid > 0 then
    insert into wallet_tx(member_id, type, amount, status, penalty_id, note, created_by)
      values (p_member, 'refund', pen.paid, 'confirmed', pen.id, 'Hoàn phạt ngày ' || to_char(p_day,'DD/MM/YYYY'), p_actor);
    insert into fund_tx(type, amount, member_id, penalty_id, note, created_by)
      values ('refund', -pen.paid, p_member, pen.id, 'Hoàn phạt ngày ' || to_char(p_day,'DD/MM/YYYY'), p_actor);
  end if;
  update penalties set status = 'voided', voided_at = now(), void_reason = p_reason where id = pen.id;
end $$;

-- ---------------------------------------------------------------------
-- TÍNH PHẠT TỰ ĐỘNG — idempotent, xử lý bù mọi ngày đã qua
-- ---------------------------------------------------------------------
create or replace function public.process_penalties() returns int
language plpgsql security definer set search_path = public as $$
declare
  s settings%rowtype;
  d date;
  last_done date;
  total int := 0;
  n int;
  r record;
  pid bigint;
begin
  -- chỉ 1 tiến trình chạy tại 1 thời điểm (cron + nhiều client cùng lúc)
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
          on conflict (member_id, day) do nothing
          returning id into pid;
        if pid is not null then
          perform _pay_penalty(pid);
          n := n + 1;
        end if;
        pid := null;
      end loop;
    end if;
    insert into processed_days(day, penalties) values (d, n) on conflict (day) do nothing;
    total := total + n;
    d := d + 1;
  end loop;
  return total;
end $$;

-- ---------------------------------------------------------------------
-- Chuỗi ngày tập (CN / ngày nghỉ / vắng có lý do không làm đứt chuỗi)
-- ---------------------------------------------------------------------
create or replace function public.member_streaks(p_member uuid) returns table(current_streak int, longest_streak int)
language plpgsql stable security definer set search_path = public as $$
declare
  s settings%rowtype; m members%rowtype; d date; cur int := 0; best int := 0; st text; today date := vn_today();
begin
  select * into s from settings where id = 1;
  select * into m from members where id = p_member;
  d := greatest(s.challenge_start, m.joined_on);
  while d <= today loop
    select status into st from attendance where member_id = p_member and day = d;
    if st = 'trained' then
      cur := cur + 1;
    elsif st in ('excused','admin_excused') or not is_mandatory(d) then
      null;
    elsif d < today then
      cur := 0;          -- vắng không lý do
    end if;
    best := greatest(best, cur);
    st := null;
    d := d + 1;
  end loop;
  current_streak := cur; longest_streak := best;
  return next;
end $$;

-- ---------------------------------------------------------------------
-- API công khai: danh sách tên để đăng nhập
-- ---------------------------------------------------------------------
create or replace function public.list_members_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color, 'has_pin', pin_hash is not null, 'locked', locked) order by created_at), '[]')
  from members where deleted_at is null
$$;

-- Đăng nhập PIN. Lần đầu (chưa có PIN) → PIN nhập vào trở thành PIN của bạn.
create or replace function public.member_login(p_member uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare m members%rowtype; tok text;
begin
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMAT'; end if;
  select * into m from members where id = p_member and deleted_at is null for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if m.locked then raise exception 'ACCOUNT_LOCKED'; end if;
  if m.pin_locked_until is not null and m.pin_locked_until > now() then raise exception 'PIN_TEMP_LOCKED'; end if;
  if m.pin_hash is null then
    update members set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), failed_pins = 0 where id = m.id;
    insert into audit_log(actor, action, details) values ('member:' || m.name, 'pin_created', jsonb_build_object('member_id', m.id));
  elsif m.pin_hash <> extensions.crypt(p_pin, m.pin_hash) then
    update members set
      pin_locked_until = case when failed_pins + 1 >= 5 then now() + interval '10 minutes' else null end,
      failed_pins = case when failed_pins + 1 >= 5 then 0 else failed_pins + 1 end
      where id = m.id;
    return jsonb_build_object('ok', false, 'error', 'PIN_WRONG');
  else
    update members set failed_pins = 0, pin_locked_until = null where id = m.id;
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into member_sessions(token_hash, member_id) values (encode(extensions.digest(tok, 'sha256'), 'hex'), m.id);
  delete from member_sessions where member_id = m.id and expires_at < now();
  return jsonb_build_object('ok', true, 'token', tok, 'member_id', m.id, 'name', m.name);
end $$;

create or replace function public.member_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from member_sessions where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.member_change_pin(p_token text, p_old text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare mid uuid := member_from_token(p_token); h text;
begin
  if p_new !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMAT'; end if;
  select pin_hash into h from members where id = mid;
  if h <> extensions.crypt(p_old, h) then raise exception 'PIN_WRONG'; end if;
  update members set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')) where id = mid;
  insert into audit_log(actor, action, details) values ('member', 'pin_changed', jsonb_build_object('member_id', mid));
end $$;

-- ---------------------------------------------------------------------
-- Check-in & đăng ký vắng (chỉ cho NGÀY HÔM NAY theo giờ VN)
-- ---------------------------------------------------------------------
create or replace function public._check_window() returns void
language plpgsql stable security definer set search_path = public as $$
declare s settings%rowtype; t time := vn_now()::time;
begin
  select * into s from settings where id = 1;
  if t < s.checkin_start or t > s.checkin_end then raise exception 'OUTSIDE_WINDOW'; end if;
end $$;

create or replace function public.member_checkin(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid := member_from_token(p_token); today date := vn_today(); old text;
begin
  perform process_penalties();
  perform _check_window();
  select status into old from attendance where member_id = mid and day = today for update;
  if old = 'trained' then raise exception 'ALREADY_CHECKED_IN'; end if;
  insert into attendance(member_id, day, status, reason, reason_note, checked_in_at, updated_at)
    values (mid, today, 'trained', null, null, now(), now())
    on conflict (member_id, day) do update
      set status = 'trained', reason = null, reason_note = null, checked_in_at = now(), updated_at = now();
  insert into attendance_log(member_id, day, old_status, new_status, actor) values (mid, today, old, 'trained', 'member');
  return jsonb_build_object('ok', true, 'day', today, 'checked_in_at', now());
end $$;

create or replace function public.member_register_absence(p_token text, p_reason text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid := member_from_token(p_token); today date := vn_today(); old text; note text := nullif(trim(coalesce(p_note,'')), '');
begin
  perform process_penalties();
  if p_reason not in ('work','hometown','sick','other') then raise exception 'REASON_INVALID'; end if;
  if p_reason = 'other' and note is null then raise exception 'REASON_NOTE_REQUIRED'; end if;
  if not is_mandatory(today) then raise exception 'NOT_MANDATORY_DAY'; end if;
  select status into old from attendance where member_id = mid and day = today for update;
  if old = 'admin_excused' then raise exception 'ALREADY_EXCUSED'; end if;
  insert into attendance(member_id, day, status, reason, reason_note, checked_in_at, updated_at)
    values (mid, today, 'excused', p_reason, note, null, now())
    on conflict (member_id, day) do update
      set status = 'excused', reason = p_reason, reason_note = note, checked_in_at = null, updated_at = now();
  insert into attendance_log(member_id, day, old_status, new_status, reason, reason_note, actor)
    values (mid, today, old, 'excused', p_reason, note, 'member');
  return jsonb_build_object('ok', true, 'day', today);
end $$;

-- Xin nạp tiền → chờ Admin xác nhận
create or replace function public.member_request_deposit(p_token text, p_amount int, p_note text, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid := member_from_token(p_token); tid bigint;
begin
  if p_amount is null or p_amount < 1000 or p_amount > 100000000 or p_amount % 1000 <> 0 then raise exception 'AMOUNT_INVALID'; end if;
  if (select count(*) from wallet_tx where member_id = mid and status = 'pending') >= 5 then raise exception 'TOO_MANY_PENDING'; end if;
  insert into wallet_tx(member_id, type, amount, status, note, idempotency_key, created_by)
    values (mid, 'deposit', p_amount, 'pending', nullif(trim(coalesce(p_note,'')),''), p_key, 'member')
    on conflict (idempotency_key) do nothing returning id into tid;
  return jsonb_build_object('ok', true, 'id', tid, 'duplicate', tid is null);
end $$;

-- ---------------------------------------------------------------------
-- Đọc dữ liệu (thành viên đã đăng nhập hoặc Admin)
-- ---------------------------------------------------------------------
create or replace function public.month_mandatory_days(p_month date) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from generate_series(date_trunc('month', p_month)::date,
    (date_trunc('month', p_month) + interval '1 month - 1 day')::date, interval '1 day') g(d)
  where is_mandatory(g.d::date)
$$;

create or replace function public.month_report(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare m0 date := date_trunc('month', p_month)::date; m1 date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  return jsonb_build_object(
    'month', m0,
    'mandatory_days', month_mandatory_days(m0),
    'mandatory_days_elapsed', (select count(*) from generate_series(m0, least(m1, vn_today()), interval '1 day') g(d) where is_mandatory(g.d::date)),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'color', m.color,
        'trained', (select count(*) from attendance a where a.member_id = m.id and a.status = 'trained' and a.day between m0 and m1),
        'excused', (select count(*) from attendance a where a.member_id = m.id and a.status in ('excused','admin_excused') and a.day between m0 and m1),
        'penalized', (select count(*) from penalties p where p.member_id = m.id and p.status = 'active' and p.day between m0 and m1),
        'penalty_total', (select coalesce(sum(amount),0) from penalties p where p.member_id = m.id and p.status = 'active' and p.day between m0 and m1),
        'balance', wallet_balance(m.id)
      ) order by m.created_at)
      from members m where m.deleted_at is null), '[]'),
    'fund_balance', (select coalesce(sum(amount),0) from fund_tx),
    'fund_penalty_month', (select coalesce(sum(paid),0) from penalties where status='active' and day between m0 and m1)
  );
end $$;

create or replace function public.app_state(p_token text, p_month date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid; admin boolean := is_admin(); today date := vn_today();
  m0 date; m1 date; result jsonb;
begin
  if not admin then me := member_from_token(p_token); end if;
  perform process_penalties();
  m0 := date_trunc('month', coalesce(p_month, today))::date;
  m1 := (m0 + interval '1 month - 1 day')::date;

  select jsonb_build_object(
    'server_now', now(),
    'today', today,
    'today_mandatory', is_mandatory(today),
    'me', me,
    'is_admin', admin,
    'month', m0,
    'settings', (select to_jsonb(s) - 'id' from settings s where id = 1),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'color', m.color, 'locked', m.locked, 'joined_on', m.joined_on,
        'has_pin', m.pin_hash is not null,
        'sessions_total', (select count(*) from attendance a where a.member_id = m.id and a.status = 'trained'),
        'excused_total', (select count(*) from attendance a where a.member_id = m.id and a.status in ('excused','admin_excused')),
        'penalized_total', (select count(*) from penalties p where p.member_id = m.id and p.status = 'active'),
        'penalty_amount_total', (select coalesce(sum(amount),0) from penalties p where p.member_id = m.id and p.status = 'active'),
        'deposited_total', (select coalesce(sum(amount),0) from wallet_tx w where w.member_id = m.id and w.status='confirmed' and w.type='deposit'),
        'outstanding', (select coalesce(sum(amount - paid),0) from penalties p where p.member_id = m.id and p.status = 'active'),
        'balance', wallet_balance(m.id),
        'streak', (select current_streak from member_streaks(m.id)),
        'best_streak', (select longest_streak from member_streaks(m.id)),
        'today', (select jsonb_build_object('status', a.status, 'reason', a.reason, 'note', a.reason_note, 'at', a.checked_in_at)
                  from attendance a where a.member_id = m.id and a.day = today)
      ) order by m.created_at)
      from members m where m.deleted_at is null), '[]'),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', a.member_id, 'day', a.day, 'status', a.status,
        'reason', a.reason, 'note', a.reason_note, 'at', a.checked_in_at) order by a.day)
      from attendance a where a.day between m0 and m1), '[]'),
    'penalties', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'member_id', p.member_id, 'day', p.day, 'amount', p.amount,
        'paid', p.paid, 'status', p.status, 'void_reason', p.void_reason) order by p.day)
      from penalties p where p.day between m0 and m1), '[]'),
    'wallet_tx', coalesce((
      select jsonb_agg(x order by (x->>'id')::bigint desc) from (
        select jsonb_build_object('id', w.id, 'member_id', w.member_id, 'type', w.type, 'amount', w.amount,
          'status', w.status, 'note', w.note, 'created_at', w.created_at, 'decided_at', w.decided_at, 'created_by', w.created_by) x
        from wallet_tx w where admin or w.member_id = me order by w.id desc limit 500) t), '[]'),
    'fund', jsonb_build_object(
      'balance', (select coalesce(sum(amount),0) from fund_tx),
      'penalty_collected', (select coalesce(sum(amount),0) from fund_tx where type in ('penalty_income','refund')),
      'penalty_uncollected', (select coalesce(sum(amount - paid),0) from penalties where status='active'),
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

create or replace function public.day_detail(p_token text, p_day date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then perform member_from_token(p_token); end if;
  return jsonb_build_object(
    'day', p_day, 'mandatory', is_mandatory(p_day),
    'log', coalesce((select jsonb_agg(jsonb_build_object('member_id', l.member_id, 'old', l.old_status, 'new', l.new_status,
        'reason', l.reason, 'note', l.reason_note, 'actor', case when l.actor like 'admin:%' then 'admin' else 'member' end, 'at', l.at) order by l.at)
      from attendance_log l where l.day = p_day), '[]'));
end $$;

-- ---------------------------------------------------------------------
-- ADMIN API (yêu cầu đăng nhập Supabase Auth + có trong bảng admins)
-- ---------------------------------------------------------------------
create or replace function public.admin_add_member(p_name text, p_color text, p_joined date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); id uuid;
begin
  if length(trim(coalesce(p_name,''))) = 0 then raise exception 'NAME_REQUIRED'; end if;
  insert into members(name, color, joined_on) values (trim(p_name), coalesce(p_color,'#39FF88'), coalesce(p_joined, vn_today()))
    returning members.id into id;
  insert into audit_log(actor, action, details) values (a, 'member_add', jsonb_build_object('id', id, 'name', p_name));
  return id;
end $$;

create or replace function public.admin_update_member(p_id uuid, p_name text, p_color text, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin();
begin
  update members set name = coalesce(nullif(trim(p_name),''), name), color = coalesce(p_color, color), locked = coalesce(p_locked, locked)
    where id = p_id and deleted_at is null;
  if p_locked then delete from member_sessions where member_id = p_id; end if;
  insert into audit_log(actor, action, details) values (a, 'member_update', jsonb_build_object('id', p_id, 'name', p_name, 'color', p_color, 'locked', p_locked));
end $$;

create or replace function public.admin_delete_member(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin();
begin
  update members set deleted_at = now() where id = p_id;      -- xóa mềm, giữ lịch sử tài chính
  delete from member_sessions where member_id = p_id;
  insert into audit_log(actor, action, details) values (a, 'member_delete', jsonb_build_object('id', p_id));
end $$;

create or replace function public.admin_reset_pin(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin();
begin
  update members set pin_hash = null, failed_pins = 0, pin_locked_until = null where id = p_id;
  delete from member_sessions where member_id = p_id;
  insert into audit_log(actor, action, details) values (a, 'pin_reset', jsonb_build_object('id', p_id));
end $$;

create or replace function public.admin_update_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); old jsonb;
begin
  select to_jsonb(s) into old from settings s where id = 1;
  update settings set
    penalty_amount  = coalesce((p->>'penalty_amount')::int, penalty_amount),
    workdays        = coalesce((select array_agg(x::int order by x::int) from jsonb_array_elements_text(p->'workdays') x), workdays),
    off_dates       = case when p ? 'off_dates' then coalesce((select array_agg(x::date order by x::date) from jsonb_array_elements_text(p->'off_dates') x), '{}') else off_dates end,
    checkin_start   = coalesce((p->>'checkin_start')::time, checkin_start),
    checkin_end     = coalesce((p->>'checkin_end')::time, checkin_end),
    challenge_start = coalesce((p->>'challenge_start')::date, challenge_start),
    updated_at      = now()
  where id = 1;
  insert into audit_log(actor, action, details) values (a, 'settings_update', jsonb_build_object('old', old, 'new', p));
end $$;

create or replace function public.admin_decide_deposit(p_id bigint, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); w wallet_tx%rowtype;
begin
  select * into w from wallet_tx where id = p_id for update;
  if not found or w.status <> 'pending' then raise exception 'NOT_PENDING'; end if;
  update wallet_tx set status = case when p_approve then 'confirmed' else 'rejected' end,
    decided_by = a, decided_at = now() where id = p_id;
  insert into audit_log(actor, action, details) values (a, case when p_approve then 'deposit_confirm' else 'deposit_reject' end,
    jsonb_build_object('id', p_id, 'member_id', w.member_id, 'amount', w.amount, 'note', p_note));
  if p_approve then perform _settle_outstanding(w.member_id); end if;
end $$;

-- Admin ghi nhận nạp tiền trực tiếp (đã nhận tiền mặt/chuyển khoản)
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
  if p_amount > 0 then perform _settle_outstanding(p_member); end if;
end $$;

create or replace function public.admin_fund_entry(p_type text, p_amount int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin();
begin
  if p_type not in ('contribution','expense','adjustment') then raise exception 'TYPE_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  if p_type = 'contribution' and p_amount <= 0 then raise exception 'AMOUNT_INVALID'; end if;
  if p_type = 'expense' then p_amount := -abs(p_amount); end if;
  insert into fund_tx(type, amount, note, created_by) values (p_type, p_amount, p_note, a);
  insert into audit_log(actor, action, details) values (a, 'fund_entry', jsonb_build_object('type', p_type, 'amount', p_amount, 'note', p_note));
end $$;

-- Admin điều chỉnh trạng thái 1 ngày (có nhật ký). p_status: 'trained' | 'admin_excused' | 'clear'
create or replace function public.admin_set_day(p_member uuid, p_day date, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); old text; pid bigint;
begin
  if p_status not in ('trained','admin_excused','clear') then raise exception 'STATUS_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  if p_day > vn_today() then raise exception 'FUTURE_DAY'; end if;
  select status into old from attendance where member_id = p_member and day = p_day for update;
  if p_status = 'clear' then
    delete from attendance where member_id = p_member and day = p_day;
    -- ngày đã qua, bắt buộc, không còn trạng thái → phạt lại (nếu chưa có phạt hiệu lực)
    if p_day < vn_today() and is_mandatory(p_day) and exists (select 1 from processed_days where day = p_day) then
      update penalties set status = 'active', paid = paid, voided_at = null, void_reason = null
        where member_id = p_member and day = p_day and status = 'voided' and paid = 0 returning id into pid;
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

create or replace function public.admin_close_month(p_month date) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); m0 date := date_trunc('month', p_month)::date;
begin
  if (m0 + interval '1 month')::date > vn_today() then raise exception 'MONTH_NOT_OVER'; end if;
  perform process_penalties();
  insert into month_closings(month, closed_by, snapshot) values (m0, a, month_report(m0))
    on conflict (month) do update set closed_at = now(), closed_by = a, snapshot = excluded.snapshot;
  insert into audit_log(actor, action, details) values (a, 'month_close', jsonb_build_object('month', m0));
end $$;

create or replace function public.admin_audit(p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return coalesce((select jsonb_agg(to_jsonb(l) order by l.id desc) from (select * from audit_log order by id desc limit p_limit) l), '[]');
end $$;

-- Sao lưu toàn bộ dữ liệu (không gồm PIN / phiên đăng nhập)
create or replace function public.admin_export() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_admin();
  return jsonb_build_object(
    'exported_at', now(),
    'settings', (select to_jsonb(s) from settings s where id = 1),
    'members', (select coalesce(jsonb_agg(to_jsonb(m) - 'pin_hash' - 'failed_pins' - 'pin_locked_until'), '[]') from members m),
    'attendance', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from attendance x),
    'attendance_log', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from attendance_log x),
    'penalties', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from penalties x),
    'wallet_tx', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from wallet_tx x),
    'fund_tx', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from fund_tx x),
    'processed_days', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from processed_days x),
    'month_closings', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from month_closings x),
    'audit_log', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from audit_log x)
  );
end $$;

-- Chỉ chạy được trong SQL Editor (không cấp cho client): gán quyền Admin
create or replace function public.bootstrap_admin(p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then raise exception 'Chưa có user % trong Authentication → Users', p_email; end if;
  insert into admins(user_id, email) values (uid, lower(p_email)) on conflict (user_id) do nothing;
  return 'OK: ' || p_email || ' là Admin';
end $$;

-- ---------------------------------------------------------------------
-- Quyền thực thi
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on all functions in schema public from anon, authenticated;
    grant execute on function
      public.list_members_public(), public.member_login(uuid, text), public.member_logout(text),
      public.member_change_pin(text, text, text), public.member_checkin(text),
      public.member_register_absence(text, text, text), public.member_request_deposit(text, int, text, text),
      public.app_state(text, date), public.day_detail(text, date), public.process_penalties(), public.is_admin()
      to anon, authenticated;
    grant execute on function
      public.admin_add_member(text, text, date), public.admin_update_member(uuid, text, text, boolean),
      public.admin_delete_member(uuid), public.admin_reset_pin(uuid), public.admin_update_settings(jsonb),
      public.admin_decide_deposit(bigint, boolean, text), public.admin_wallet_entry(uuid, text, int, text),
      public.admin_fund_entry(text, int, text), public.admin_set_day(uuid, date, text, text),
      public.admin_close_month(date), public.admin_audit(int), public.admin_export()
      to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Lịch chạy tự động (pg_cron có trong gói Free). Mỗi giờ phút 05 — idempotent.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'gym-process-penalties';
    perform cron.schedule('gym-process-penalties', '5 * * * *', 'select public.process_penalties()');
  end if;
exception when others then
  raise notice 'pg_cron chưa bật (%). App vẫn tự xử lý bù khi có người truy cập.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- 5 thành viên ban đầu (chỉ thêm khi bảng trống)
-- ---------------------------------------------------------------------
insert into public.members(name, color)
select * from (values ('Anh An','#39FF88'), ('Anh Hạnh','#00E5FF'), ('Em Giáp','#FFD23F'), ('Em Tuấn','#FF6B6B'), ('Em Hoàng','#B388FF')) v(name, color)
where not exists (select 1 from public.members);
