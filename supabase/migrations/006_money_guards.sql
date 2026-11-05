-- =====================================================================
-- GYM CHALLENGE — 006: chặn chi vượt quỹ / hoàn vượt ví ngay tại database
-- An toàn khi chạy lại.
-- =====================================================================
create or replace function public.admin_fund_entry(p_type text, p_amount int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin(); bal int;
begin
  if p_type not in ('contribution','expense','adjustment') then raise exception 'TYPE_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'AMOUNT_INVALID'; end if;
  if p_type = 'contribution' and p_amount <= 0 then raise exception 'AMOUNT_INVALID'; end if;
  if p_type = 'expense' then p_amount := -abs(p_amount); end if;
  perform pg_advisory_xact_lock(515151);
  select coalesce(sum(amount), 0) into bal from fund_tx;
  if p_amount < 0 and bal + p_amount < 0 then raise exception 'FUND_INSUFFICIENT'; end if;
  insert into fund_tx(type, amount, note, created_by) values (p_type, p_amount, p_note, a);
  insert into audit_log(actor, action, details) values (a, 'fund_entry', jsonb_build_object('type', p_type, 'amount', p_amount, 'note', p_note));
end $$;

create or replace function public.admin_wallet_entry(p_member uuid, p_type text, p_amount int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a text := require_admin();
begin
  if p_type not in ('deposit','adjustment') then raise exception 'TYPE_INVALID'; end if;
  if p_amount is null or p_amount = 0 or (p_type = 'deposit' and p_amount < 0) then raise exception 'AMOUNT_INVALID'; end if;
  if length(trim(coalesce(p_note,''))) = 0 then raise exception 'NOTE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('wallet:' || p_member::text));
  if p_amount < 0 and wallet_balance(p_member) + p_amount < 0 then raise exception 'WALLET_INSUFFICIENT'; end if;
  insert into wallet_tx(member_id, type, amount, status, note, created_by, decided_by, decided_at)
    values (p_member, p_type, p_amount, 'confirmed', p_note, a, a, now());
  insert into audit_log(actor, action, details) values (a, 'wallet_entry', jsonb_build_object('member_id', p_member, 'type', p_type, 'amount', p_amount, 'note', p_note));
  if p_type = 'deposit' then perform _charge_dues(); perform _apply_deposit(p_member, p_amount); end if;
  if p_amount > 0 then perform _settle_outstanding(p_member); end if;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.admin_fund_entry(text, int, text), public.admin_wallet_entry(uuid, text, int, text) to authenticated;
  end if;
end $$;

select 'OK 006' as ket_qua;
