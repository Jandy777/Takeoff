-- The user explicitly requested control for their own admin account over
-- anyone registered, especially Tyler Ziegler and Obren Sijan. Only the owner
-- can approve personal-email editing/admin exceptions; other administrators
-- retain the company-domain restriction. No existing user is promoted here.
-- Apply after simple-signup.sql.
alter table public.team_members
  add column is_owner boolean not null default false,
  add column external_role_approved boolean not null default false;
-- Bind ownership once to the existing administrator's stable user ID. It does
-- not follow email changes or grant ownership to future signups with that email.
update public.team_members set is_owner=true
where email='jake@concretews.com' and role='admin' and access_enabled and registration_complete;
create unique index one_takeoff_owner on public.team_members(is_owner) where is_owner;

create function private.takeoff_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.team_members m join auth.users u on u.id=m.user_id
    where m.user_id=(select auth.uid()) and m.is_owner and m.role='admin'
      and m.access_enabled and m.registration_complete and u.email_confirmed_at is not null)
$$;
revoke all on function private.takeoff_owner() from public,anon;
grant execute on function private.takeoff_owner() to authenticated;

-- A row-level check replaces the unconditional domain constraint: the owner
-- can approve individual external accounts, while other admins cannot.
alter table public.team_access drop constraint editing_requires_work_email;
alter policy "Admin manages allowed accounts" on public.team_access
with check ((select private.takeoff_role())='admin' and
  (role='viewer' or email ~ '^[^@[:space:]]+@concretews[.]com$' or (select private.takeoff_owner())));

create or replace function private.takeoff_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when lower(u.email) ~ '^[^@[:space:]]+@concretews[.]com$' or m.external_role_approved
    then m.role else 'viewer' end
  from public.team_members m join auth.users u on u.id=m.user_id
  where m.user_id=(select auth.uid()) and m.access_enabled and m.registration_complete
    and u.email_confirmed_at is not null
$$;
revoke all on function private.takeoff_role() from public,anon;
grant execute on function private.takeoff_role() to authenticated;

create or replace function private.sync_takeoff_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  existing public.team_members;
  requested_id text;
  employee_name text;
  selected_id text;
  chosen_role text;
  approved_external boolean;
begin
  if TG_TABLE_NAME='users' then
    select * into existing from public.team_members where user_id=NEW.id;
    requested_id := existing.requested_employee_id;
    employee_name := coalesce(existing.display_name,'');
    if existing.user_id is null and lower(NEW.email) ~ '^[^@[:space:]]+@concretews[.]com$' then
      select id,full_name into requested_id,employee_name from private.employee_directory
      where id=NEW.raw_user_meta_data->>'employee_id';
    end if;
    -- Signup metadata and pre-registration entries never grant a role. An
    -- existing approval survives sign-in, but an email change needs reapproval.
    chosen_role := case when existing.email=lower(NEW.email) then existing.role else 'viewer' end;
    approved_external := case when existing.email=lower(NEW.email) then coalesce(existing.external_role_approved,false) else false end;
    if NEW.email_confirmed_at is null or (lower(NEW.email) !~ '^[^@[:space:]]+@concretews[.]com$' and not approved_external) then chosen_role := 'viewer'; end if;
    insert into public.team_members(user_id,email,role,employee_id,requested_employee_id,display_name,access_enabled,registration_complete,external_role_approved)
    values(NEW.id,lower(NEW.email),coalesce(chosen_role,'viewer'),existing.employee_id,requested_id,coalesce(employee_name,''),coalesce(existing.access_enabled,true),NEW.email_confirmed_at is not null,coalesce(approved_external,false))
    on conflict(user_id) do update set email=excluded.email,role=excluded.role,
      registration_complete=excluded.registration_complete,external_role_approved=excluded.external_role_approved;
    return NEW;
  end if;
  if TG_OP='DELETE' then
    update public.team_members set access_enabled=false where email=OLD.email;
    return OLD;
  end if;
  select * into existing from public.team_members where email=NEW.email for update;
  if existing.user_id is null then return NEW; end if;
  selected_id := existing.employee_id;
  if NEW.role in ('admin','estimator') and selected_id is null and existing.requested_employee_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('takeoff-employee:' || existing.requested_employee_id,0));
    if exists(select 1 from public.team_members where employee_id=existing.requested_employee_id and user_id<>existing.user_id) then
      raise exception 'This employee already has an approved account. Review the name and email before granting editing.';
    end if;
    selected_id := existing.requested_employee_id;
  end if;
  -- The policy above admits external elevation only from the owner. These
  -- protected columns have no client INSERT/UPDATE grants.
  update public.team_members set role=NEW.role,employee_id=selected_id,access_enabled=true,
    external_role_approved=(NEW.email !~ '^[^@[:space:]]+@concretews[.]com$' and NEW.role in ('admin','estimator'))
  where user_id=existing.user_id;
  return NEW;
end $$;
revoke all on function private.sync_takeoff_member() from public,anon,authenticated;

create or replace function private.protect_takeoff_member_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if OLD.role='admin' and OLD.access_enabled and OLD.registration_complete and
    (NEW.role<>'admin' or not NEW.access_enabled or not NEW.registration_complete) then
    perform pg_advisory_xact_lock(74812901);
    if not exists(select 1 from public.team_members m join auth.users u on u.id=m.user_id
      where m.user_id<>OLD.user_id and m.role='admin' and m.access_enabled and m.registration_complete
        and u.email_confirmed_at is not null
        and (lower(u.email) ~ '^[^@[:space:]]+@concretews[.]com$' or m.external_role_approved)) then
      raise exception 'Keep at least one active administrator.';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function private.protect_takeoff_member_admin() from public,anon,authenticated;
