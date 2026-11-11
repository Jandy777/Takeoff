-- Takeoff shared drawing library. Editable drawing data only; no PDF storage.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.team_access (
  email text primary key check (email = lower(trim(email))),
  role text not null check (role in ('admin', 'estimator', 'viewer')),
  created_at timestamptz not null default now()
);
create table public.team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('admin', 'estimator', 'viewer'))
);
alter table public.team_access enable row level security;
alter table public.team_members enable row level security;
revoke all on public.team_access, public.team_members from anon, authenticated;

-- Policies must read the authoritative role without recursing through their
-- own RLS policy. No client-editable JWT metadata participates in permissions.
create function private.takeoff_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.team_members where user_id = (select auth.uid()) $$;
revoke all on function private.takeoff_role() from public;
grant execute on function private.takeoff_role() to authenticated;

create policy "Members see their own membership; admin sees team" on public.team_members
for select to authenticated using (user_id = (select auth.uid()) or (select private.takeoff_role()) = 'admin');
create policy "Admin manages allowed accounts" on public.team_access
for all to authenticated using ((select private.takeoff_role()) = 'admin')
with check ((select private.takeoff_role()) = 'admin');
grant select on public.team_members to authenticated;
grant select, insert, delete on public.team_access to authenticated;
grant update(role) on public.team_access to authenticated;

create function private.sync_takeoff_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_TABLE_NAME = 'users' then
    insert into public.team_members(user_id, email, role)
    select NEW.id, lower(NEW.email), a.role from public.team_access a where a.email = lower(NEW.email)
    on conflict(user_id) do update set email = excluded.email, role = excluded.role;
    return NEW;
  end if;
  if TG_OP = 'DELETE' then
    delete from public.team_members where email = OLD.email;
    return OLD;
  end if;
  insert into public.team_members(user_id, email, role)
  select u.id, lower(u.email), NEW.role from auth.users u where lower(u.email) = NEW.email
  on conflict(user_id) do update set email = excluded.email, role = excluded.role;
  return NEW;
end $$;
revoke all on function private.sync_takeoff_member() from public;
create trigger on_takeoff_signup after insert or update of email on auth.users for each row execute function private.sync_takeoff_member();
create trigger on_takeoff_access after insert or update or delete on public.team_access for each row execute function private.sync_takeoff_member();

-- Protect the final administrator from accidental removal/demotion.
create function private.keep_takeoff_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if OLD.role = 'admin' and (TG_OP = 'DELETE' or NEW.role <> 'admin') then
    perform pg_advisory_xact_lock(74812901);
    if not exists(select 1 from public.team_access where role = 'admin' and email <> OLD.email) then
      raise exception 'Keep at least one administrator on the team.';
    end if;
  end if;
  return case when TG_OP = 'DELETE' then OLD else NEW end;
end $$;
revoke all on function private.keep_takeoff_admin() from public;
create trigger keep_takeoff_admin before update or delete on public.team_access for each row execute function private.keep_takeoff_admin();

create table public.drawings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (length(trim(customer_name)) between 1 and 160),
  project_name text not null check (length(trim(project_name)) between 1 and 160),
  city text not null default '' check(length(city) <= 160),
  estimator_name text not null default '' check(length(estimator_name) <= 160),
  print_revision text not null check (length(trim(print_revision)) between 1 and 160),
  model_name text not null default '' check(length(model_name) <= 160),
  elevation text not null default '' check(length(elevation) <= 160),
  job_type text not null default 'custom' check(job_type in ('custom','tract')),
  parent_id uuid references public.drawings(id) on delete restrict,
  locked boolean not null default false,
  document jsonb not null check(jsonb_typeof(document) = 'object'),
  settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings) = 'object'),
  version integer not null default 1,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.drawings enable row level security;
revoke all on public.drawings from anon, authenticated;
grant select, insert, update on public.drawings to authenticated;
create policy "Team can read drawings" on public.drawings for select to authenticated
using ((select private.takeoff_role()) in ('admin','estimator','viewer'));
create policy "Estimators create drawings" on public.drawings for insert to authenticated
with check ((select private.takeoff_role()) in ('admin','estimator') and created_by = (select auth.uid()) and updated_by = (select auth.uid()));
create policy "Estimators update working drawings" on public.drawings for update to authenticated
using ((select private.takeoff_role()) in ('admin','estimator') and not locked)
with check ((select private.takeoff_role()) in ('admin','estimator') and updated_by = (select auth.uid()));
create index drawings_recent_idx on public.drawings(updated_at desc);
create index drawings_project_idx on public.drawings(customer_name, project_name);
create index drawings_parent_idx on public.drawings(parent_id);
create index drawings_created_by_idx on public.drawings(created_by);
create index drawings_updated_by_idx on public.drawings(updated_by);

create function private.stamp_takeoff_drawing() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if OLD.locked then raise exception 'This revision is preserved. Create a new revision to make changes.'; end if;
    NEW.id := OLD.id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.parent_id := OLD.parent_id;
    NEW.version := OLD.version + 1;
  else
    NEW.created_by := auth.uid();
    NEW.version := 1;
  end if;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  return NEW;
end $$;
revoke all on function private.stamp_takeoff_drawing() from public;
create trigger stamp_takeoff_drawing before insert or update on public.drawings
for each row execute function private.stamp_takeoff_drawing();

-- Atomically preserve the previous revision and begin an independent working
-- copy. The caller retains normal RLS restrictions (SECURITY INVOKER).
create function public.new_drawing_revision(source_id uuid, expected_version integer, details jsonb)
returns public.drawings language plpgsql security invoker set search_path = '' as $$
declare source public.drawings; result public.drawings;
begin
  if (select private.takeoff_role()) not in ('admin','estimator') then raise exception 'Editing access is required.'; end if;
  select * into source from public.drawings where id = source_id;
  if source.id is null or source.version <> expected_version then raise exception 'This drawing changed. Open the latest version before creating a revision.'; end if;
  if not source.locked then
    update public.drawings set locked = true where id = source_id and version = expected_version returning * into source;
    if not found then raise exception 'This drawing changed. Open the latest version before creating a revision.'; end if;
  end if;
  insert into public.drawings(customer_name,project_name,city,estimator_name,print_revision,model_name,elevation,job_type,parent_id,document,settings)
  values(details->>'customer_name',details->>'project_name',coalesce(details->>'city',source.city),coalesce(details->>'estimator_name',source.estimator_name),details->>'print_revision',coalesce(details->>'model_name',''),coalesce(details->>'elevation',''),coalesce(details->>'job_type','custom'),source_id,source.document,source.settings)
  returning * into result;
  return result;
end $$;
revoke all on function public.new_drawing_revision(uuid,integer,jsonb) from public;
grant execute on function public.new_drawing_revision(uuid,integer,jsonb) to authenticated;

insert into public.team_access(email,role) values ('jake@concretews.com','admin');
