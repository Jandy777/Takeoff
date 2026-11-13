-- Shared verified customer/builder directory. Existing drawing names are snapshots.
create table public.builders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160 and name=regexp_replace(btrim(name),'\s+',' ','g')),
  name_key text generated always as (lower(regexp_replace(btrim(name),'\s+',' ','g'))) stored unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.builders enable row level security;
revoke all on public.builders from public,anon,authenticated;
grant select,insert,update on public.builders to authenticated;
create policy "Team reads builder directory" on public.builders for select to authenticated
using ((select private.takeoff_role()) in ('admin','estimator','viewer'));
create policy "Editors add builders" on public.builders for insert to authenticated
with check ((select private.takeoff_role()) in ('admin','estimator'));
create policy "Editors maintain builders" on public.builders for update to authenticated
using ((select private.takeoff_role()) in ('admin','estimator'))
with check ((select private.takeoff_role()) in ('admin','estimator'));
-- Removing means retiring a choice, never deleting drawings or their metadata.
insert into public.builders(name)
select distinct on (lower(normalized)) normalized from (
  select regexp_replace(btrim(customer_name),'\s+',' ','g') normalized from public.drawings
) names where char_length(normalized) between 1 and 160
order by lower(normalized),normalized;
