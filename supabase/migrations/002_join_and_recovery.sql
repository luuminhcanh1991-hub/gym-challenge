-- =====================================================================
-- GYM CHALLENGE — 002: tự tham gia nhóm bằng mã mời + khôi phục PIN
-- Chạy trong Supabase → SQL Editor (an toàn khi chạy lại).
-- =====================================================================

alter table public.settings add column if not exists allow_self_join boolean not null default true;
alter table public.settings add column if not exists join_code text;
update public.settings set join_code = upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6)) where id = 1 and join_code is null;
alter table public.members add column if not exists recovery_hash text;
alter table public.members add column if not exists self_joined boolean not null default false;

-- Mã khôi phục dạng XXXX-XXXX (không có ký tự dễ nhầm 0/O/1/I)
create or replace function public._new_recovery_code() returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := extensions.gen_random_bytes(8); s text := ''; i int;
begin
  for i in 0..7 loop s := s || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return substr(s, 1, 4) || '-' || substr(s, 5, 4);
end $$;

create or replace function public._norm_code(p text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

create or replace function public._set_recovery(p_member uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text := _new_recovery_code();
begin
  update members set recovery_hash = extensions.crypt(_norm_code(c), extensions.gen_salt('bf')) where id = p_member;
  return c;
end $$;

create or replace function public._new_session(p_member uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into member_sessions(token_hash, member_id) values (encode(extensions.digest(tok, 'sha256'), 'hex'), p_member);
  delete from member_sessions where member_id = p_member and expires_at < now();
  return tok;
end $$;

create or replace function public._pin_fail(p_member uuid) returns void
language sql security definer set search_path = public as $$
  update members set
    pin_locked_until = case when failed_pins + 1 >= 5 then now() + interval '10 minutes' else null end,
    failed_pins = case when failed_pins + 1 >= 5 then 0 else failed_pins + 1 end
  where id = p_member
$$;

-- Danh sách tên đăng nhập (thêm cờ: đã có mã khôi phục, cho phép tự tham gia)
create or replace function public.list_members_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'color', color, 'has_pin', pin_hash is not null,
    'has_recovery', recovery_hash is not null, 'locked', locked) order by created_at, name), '[]')
  from members where deleted_at is null
$$;

create or replace function public.join_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('allow_self_join', allow_self_join) from settings where id = 1
$$;

-- Đăng nhập PIN. Lần đầu tạo PIN → trả về mã khôi phục (chỉ hiện 1 lần)
create or replace function public.member_login(p_member uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare m members%rowtype; rc text;
begin
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMAT'; end if;
  select * into m from members where id = p_member and deleted_at is null for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if m.locked then raise exception 'ACCOUNT_LOCKED'; end if;
  if m.pin_locked_until is not null and m.pin_locked_until > now() then raise exception 'PIN_TEMP_LOCKED'; end if;
  if m.pin_hash is null then
    update members set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), failed_pins = 0 where id = m.id;
    rc := _set_recovery(m.id);
    insert into audit_log(actor, action, details) values ('member:' || m.name, 'pin_created', jsonb_build_object('member_id', m.id));
  elsif m.pin_hash <> extensions.crypt(p_pin, m.pin_hash) then
    perform _pin_fail(m.id);
    return jsonb_build_object('ok', false, 'error', 'PIN_WRONG');
  else
    update members set failed_pins = 0, pin_locked_until = null where id = m.id;
  end if;
  return jsonb_build_object('ok', true, 'token', _new_session(m.id), 'member_id', m.id, 'name', m.name, 'recovery_code', rc);
end $$;

-- Thành viên mới tự tham gia bằng mã mời của nhóm
create or replace function public.member_join(p_code text, p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s settings%rowtype; nm text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'); mid uuid; rc text;
  palette text[] := array['#39FF88','#00E5FF','#FFD23F','#FF6B6B','#B388FF','#FF9F43','#4DA3FF','#F5F7F6'];
begin
  if not pg_try_advisory_xact_lock(434343) then raise exception 'TRY_AGAIN'; end if;
  select * into s from settings where id = 1;
  if not s.allow_self_join then raise exception 'JOIN_DISABLED'; end if;
  if (select count(*) from audit_log where action = 'join_failed' and at > now() - interval '15 minutes') >= 20 then raise exception 'TOO_MANY_ATTEMPTS'; end if;
  if s.join_code is null or _norm_code(p_code) <> _norm_code(s.join_code) then
    insert into audit_log(actor, action, details) values ('public', 'join_failed', jsonb_build_object('name', left(nm, 40)));
    return jsonb_build_object('ok', false, 'error', 'JOIN_CODE_WRONG');
  end if;
  if length(nm) < 2 or length(nm) > 40 then raise exception 'NAME_INVALID'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMAT'; end if;
  if exists (select 1 from members where lower(name) = lower(nm) and deleted_at is null) then raise exception 'NAME_TAKEN'; end if;
  if (select count(*) from members where self_joined and created_at > now() - interval '1 hour') >= 10 then raise exception 'TOO_MANY_ATTEMPTS'; end if;
  insert into members(name, color, pin_hash, joined_on, self_joined)
    values (nm, palette[1 + (select count(*) from members) % array_length(palette, 1)],
            extensions.crypt(p_pin, extensions.gen_salt('bf')), vn_today(), true)
    returning id into mid;
  rc := _set_recovery(mid);
  insert into audit_log(actor, action, details) values ('member:' || nm, 'member_self_join', jsonb_build_object('id', mid, 'name', nm));
  return jsonb_build_object('ok', true, 'token', _new_session(mid), 'member_id', mid, 'name', nm, 'recovery_code', rc);
end $$;

-- Quên PIN: đặt PIN mới bằng mã khôi phục → cấp mã khôi phục mới, đăng xuất mọi thiết bị cũ
create or replace function public.member_recover_pin(p_member uuid, p_code text, p_new_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare m members%rowtype; rc text;
begin
  if p_new_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN_FORMAT'; end if;
  select * into m from members where id = p_member and deleted_at is null for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  if m.locked then raise exception 'ACCOUNT_LOCKED'; end if;
  if m.pin_locked_until is not null and m.pin_locked_until > now() then raise exception 'PIN_TEMP_LOCKED'; end if;
  if m.recovery_hash is null then raise exception 'NO_RECOVERY_CODE'; end if;
  if m.recovery_hash <> extensions.crypt(_norm_code(p_code), m.recovery_hash) then
    perform _pin_fail(m.id);
    return jsonb_build_object('ok', false, 'error', 'RECOVERY_WRONG');
  end if;
  update members set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')), failed_pins = 0, pin_locked_until = null where id = m.id;
  delete from member_sessions where member_id = m.id;
  rc := _set_recovery(m.id);
  insert into audit_log(actor, action, details) values ('member:' || m.name, 'pin_recovered', jsonb_build_object('member_id', m.id));
  return jsonb_build_object('ok', true, 'token', _new_session(m.id), 'member_id', m.id, 'name', m.name, 'recovery_code', rc);
end $$;

-- Tạo (lại) mã khôi phục khi đang đăng nhập — mã cũ hết hiệu lực
create or replace function public.member_new_recovery_code(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare mid uuid := member_from_token(p_token);
begin
  insert into audit_log(actor, action, details) values ('member', 'recovery_regenerated', jsonb_build_object('member_id', mid));
  return _set_recovery(mid);
end $$;

create or replace function public.admin_reset_pin(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin();
begin
  update members set pin_hash = null, recovery_hash = null, failed_pins = 0, pin_locked_until = null where id = p_id;
  delete from member_sessions where member_id = p_id;
  insert into audit_log(actor, action, details) values (a, 'pin_reset', jsonb_build_object('id', p_id));
end $$;

create or replace function public.admin_update_settings(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); old jsonb;
begin
  select to_jsonb(s) into old from settings s where id = 1;
  if p ? 'join_code' and length(_norm_code(p->>'join_code')) < 4 then raise exception 'JOIN_CODE_SHORT'; end if;
  update settings set
    penalty_amount  = coalesce((p->>'penalty_amount')::int, penalty_amount),
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
end $$;

-- Quyền thực thi
revoke execute on function public._new_recovery_code(), public._norm_code(text), public._set_recovery(uuid),
  public._new_session(uuid), public._pin_fail(uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public._new_recovery_code(), public._norm_code(text), public._set_recovery(uuid),
      public._new_session(uuid), public._pin_fail(uuid) from anon, authenticated;
    grant execute on function public.list_members_public(), public.join_info(), public.member_login(uuid, text),
      public.member_join(text, text, text), public.member_recover_pin(uuid, text, text),
      public.member_new_recovery_code(text) to anon, authenticated;
    grant execute on function public.admin_reset_pin(uuid), public.admin_update_settings(jsonb) to authenticated;
  end if;
end $$;
