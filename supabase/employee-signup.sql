-- Employee self-registration and automatic verified viewer accounts.
-- Apply after schema.sql on an existing Takeoff project.
create table private.employee_directory (
  id text primary key,
  full_name text not null
);
alter table private.employee_directory enable row level security;
revoke all on private.employee_directory from public, anon, authenticated;
insert into private.employee_directory(id,full_name) values
  ('hector-reyes','Hector Reyes'), ('don-baggio','Don Baggio'),
  ('steve-martin','Steve Martin'), ('scott-martin','Scott Martin'),
  ('chuck-atkinson','Chuck Atkinson'), ('randy-guenther','Randy Guenther'),
  ('eric-oneil','Eric O''Neil');

alter table public.team_members
  add column employee_id text unique references private.employee_directory(id),
  add column display_name text not null default '',
  add column access_enabled boolean not null default true,
  add column registration_complete boolean not null default false;
update public.team_members m set registration_complete = (u.email_confirmed_at is not null)
from auth.users u where u.id=m.user_id;

alter table public.team_access add constraint editing_requires_work_email
check (role = 'viewer' or email ~ '^[^@[:space:]]+@concretews[.]com$');

-- Roles are read from protected membership data and the actual Auth record,
-- never from editable JWT user_metadata or a claimed name in the browser.
create or replace function private.takeoff_role() returns text
language sql stable security definer set search_path = '' as $$
  select case when lower(u.email) ~ '^[^@[:space:]]+@concretews[.]com$' then m.role else 'viewer' end
  from public.team_members m join auth.users u on u.id=m.user_id
  where m.user_id=(select auth.uid()) and m.access_enabled and m.registration_complete
    and u.email_confirmed_at is not null
$$;
revoke all on function private.takeoff_role() from public;
grant execute on function private.takeoff_role() to authenticated;

create or replace function private.sync_takeoff_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  existing public.team_members;
  selected_id text;
  selected_name text;
  chosen_role text;
  override_role text;
  work_email boolean;
  verified boolean;
begin
  if TG_TABLE_NAME = 'users' then
    select * into existing from public.team_members where user_id=NEW.id;
    work_email := lower(NEW.email) ~ '^[^@[:space:]]+@concretews[.]com$';
    verified := NEW.email_confirmed_at is not null;
    chosen_role := coalesce(existing.role,'viewer');
    selected_id := existing.employee_id;
    selected_name := coalesce(existing.display_name,'');

    if verified then
      select role into override_role from public.team_access where email=lower(NEW.email);
      if not coalesce(existing.registration_complete,false) then
        chosen_role := 'viewer';
        -- Registration metadata is only a request. The verified company email,
        -- trusted roster, and one-account-per-employee check authorize access.
        if work_email and coalesce(existing.access_enabled,true) then
          select id, full_name into selected_id, selected_name from private.employee_directory
          where id=NEW.raw_user_meta_data->>'employee_id';
          if selected_id is not null then
            perform pg_advisory_xact_lock(hashtextextended('takeoff-employee:' || selected_id,0));
            if exists(select 1 from public.team_members where employee_id=selected_id and user_id<>NEW.id) then
              selected_id := null; selected_name := '';
            else
              chosen_role := 'estimator';
            end if;
          end if;
        end if;
      end if;
      chosen_role := coalesce(override_role,chosen_role);
    else
      chosen_role := 'viewer';
    end if;
    if not coalesce(work_email,false) then chosen_role := 'viewer'; end if;
    insert into public.team_members(user_id,email,role,employee_id,display_name,access_enabled,registration_complete)
    values(NEW.id,lower(NEW.email),chosen_role,selected_id,coalesce(selected_name,''),coalesce(existing.access_enabled,true),verified)
    on conflict(user_id) do update set email=excluded.email,role=excluded.role,
      employee_id=excluded.employee_id,display_name=excluded.display_name,
      registration_complete=excluded.registration_complete;
    return NEW;
  end if;
  if TG_OP = 'DELETE' then
    update public.team_members set access_enabled=false where email=OLD.email;
    return OLD;
  end if;
  insert into public.team_members(user_id,email,role,access_enabled,registration_complete)
  select u.id,lower(u.email),case when lower(u.email) ~ '^[^@[:space:]]+@concretews[.]com$' then NEW.role else 'viewer' end,
    true,u.email_confirmed_at is not null
  from auth.users u where lower(u.email)=NEW.email
  on conflict(user_id) do update set role=excluded.role,access_enabled=true;
  return NEW;
end $$;
revoke all on function private.sync_takeoff_member() from public;
drop trigger on_takeoff_signup on auth.users;
create trigger on_takeoff_signup after insert or update of email,email_confirmed_at on auth.users
for each row execute function private.sync_takeoff_member();

-- Existing verified accounts that predate this flow receive at most viewing.
insert into public.team_members(user_id,email,role,registration_complete)
select u.id,lower(u.email),'viewer',u.email_confirmed_at is not null from auth.users u
where u.email is not null and not exists(select 1 from public.team_members m where m.user_id=u.id);

-- Admin can disable registered accounts as well as remove preapprovals.
grant update(access_enabled) on public.team_members to authenticated;
create policy "Admin enables or disables accounts" on public.team_members for update to authenticated
using ((select private.takeoff_role())='admin') with check ((select private.takeoff_role())='admin');

create function private.protect_takeoff_member_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if OLD.role='admin' and OLD.access_enabled and
    (NEW.role<>'admin' or not NEW.access_enabled or NEW.email !~ '^[^@[:space:]]+@concretews[.]com$') then
    perform pg_advisory_xact_lock(74812901);
    if not exists(select 1 from public.team_members m join auth.users u on u.id=m.user_id
      where m.user_id<>OLD.user_id and m.role='admin' and m.access_enabled and m.registration_complete
        and u.email_confirmed_at is not null and lower(u.email) ~ '^[^@[:space:]]+@concretews[.]com$') then
      raise exception 'Keep at least one active administrator with a company email.';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function private.protect_takeoff_member_admin() from public;
create trigger protect_takeoff_member_admin before update on public.team_members
for each row execute function private.protect_takeoff_member_admin();
