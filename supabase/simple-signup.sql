-- Simple signup: everyone starts as a viewer; only the administrator grants
-- editing to an already registered company account. This is safe to use with
-- confirmation emails disabled. Apply after social-signin.sql.
alter table public.team_members add column requested_employee_id text references private.employee_directory(id);

-- Remove self-service elevation before changing the Auth confirmation setting.
revoke all on function public.claim_employee_account(text) from public,anon,authenticated;
revoke all on function private.claim_employee_account(text) from public,anon,authenticated;

create or replace function private.sync_takeoff_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  existing public.team_members;
  requested_id text;
  employee_name text;
  selected_id text;
  chosen_role text;
begin
  if TG_TABLE_NAME='users' then
    select * into existing from public.team_members where user_id=NEW.id;
    requested_id := existing.requested_employee_id;
    employee_name := coalesce(existing.display_name,'');
    if existing.user_id is null and lower(NEW.email) ~ '^[^@[:space:]]+@concretews[.]com$' then
      select id,full_name into requested_id,employee_name from private.employee_directory
      where id=NEW.raw_user_meta_data->>'employee_id';
    end if;
    -- A typed email, roster name, or older preapproval never grants privileges.
    -- Changing addresses requires a new administrator approval for editing.
    chosen_role := case when existing.email=lower(NEW.email) then existing.role else 'viewer' end;
    if NEW.email_confirmed_at is null or lower(NEW.email) !~ '^[^@[:space:]]+@concretews[.]com$' then chosen_role := 'viewer'; end if;
    insert into public.team_members(user_id,email,role,employee_id,requested_employee_id,display_name,access_enabled,registration_complete)
    values(NEW.id,lower(NEW.email),coalesce(chosen_role,'viewer'),existing.employee_id,requested_id,coalesce(employee_name,''),coalesce(existing.access_enabled,true),NEW.email_confirmed_at is not null)
    on conflict(user_id) do update set email=excluded.email,role=excluded.role,registration_complete=excluded.registration_complete;
    return NEW;
  end if;
  if TG_OP='DELETE' then
    update public.team_members set access_enabled=false where email=OLD.email;
    return OLD;
  end if;
  select * into existing from public.team_members where email=NEW.email for update;
  if existing.user_id is null then return NEW; end if;
  chosen_role := case when NEW.email ~ '^[^@[:space:]]+@concretews[.]com$' then NEW.role else 'viewer' end;
  selected_id := existing.employee_id;
  if chosen_role in ('admin','estimator') and selected_id is null and existing.requested_employee_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('takeoff-employee:' || existing.requested_employee_id,0));
    if exists(select 1 from public.team_members where employee_id=existing.requested_employee_id and user_id<>existing.user_id) then
      raise exception 'This employee already has an approved account. Review the name and email before granting editing.';
    end if;
    selected_id := existing.requested_employee_id;
  end if;
  update public.team_members set role=chosen_role,employee_id=selected_id,access_enabled=true where user_id=existing.user_id;
  return NEW;
end $$;
revoke all on function private.sync_takeoff_member() from public,anon,authenticated;
