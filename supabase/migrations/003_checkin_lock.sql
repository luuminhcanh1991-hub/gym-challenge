-- =====================================================================
-- GYM CHALLENGE — 003: khóa theo thành viên khi check-in / báo vắng
-- (chống 2 yêu cầu đồng thời cùng ghi nhận). An toàn khi chạy lại.
-- =====================================================================

create or replace function public.member_checkin(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid := member_from_token(p_token); today date := vn_today(); old text;
begin
  perform pg_advisory_xact_lock(hashtext('att:' || mid::text));
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
  perform pg_advisory_xact_lock(hashtext('att:' || mid::text));
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
