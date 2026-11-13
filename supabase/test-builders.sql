-- All permission fixtures and directory changes roll back.
begin;
select set_config('takeoff.builder_admin',gen_random_uuid()::text,true);
select set_config('takeoff.builder_estimator',gen_random_uuid()::text,true);
select set_config('takeoff.builder_viewer',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at) values
 (current_setting('takeoff.builder_admin')::uuid,'directory-admin-test@concretews.com','authenticated','authenticated',now(),now(),now()),
 (current_setting('takeoff.builder_estimator')::uuid,'directory-estimator-test@concretews.com','authenticated','authenticated',now(),now(),now()),
 (current_setting('takeoff.builder_viewer')::uuid,'directory-viewer-test@concretews.com','authenticated','authenticated',now(),now(),now());
insert into public.team_access(email,role) values ('directory-admin-test@concretews.com','admin'),('directory-estimator-test@concretews.com','estimator'),('directory-viewer-test@concretews.com','viewer');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.builder_estimator'),'role','authenticated')::text,true);
do $$ declare item uuid; begin
 if private.takeoff_role()<>'estimator' then raise exception 'Estimator fixture failed'; end if;
 insert into public.builders(name) values('Directory Test Company') returning id into item;
 update public.builders set name='Directory Renamed Company' where id=item;
 if not exists(select 1 from public.builders where id=item and name='Directory Renamed Company') then raise exception 'Estimator rename failed'; end if;
 begin
  insert into public.builders(name) values('directory renamed company');
  raise exception 'Duplicate name accepted';
 exception when unique_violation then null; end;
 update public.builders set active=false where id=item;
 if exists(select 1 from public.builders where id=item and active) then raise exception 'Estimator remove failed'; end if;
 insert into public.builders(name,active) values('Directory Renamed Company',true) on conflict(name_key) do update set active=true;
 if not exists(select 1 from public.builders where id=item and active) then raise exception 'Restore failed'; end if;
 perform set_config('takeoff.builder_item',item::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.builder_viewer'),'role','authenticated')::text,true);
do $$ declare affected integer; begin
 if not exists(select 1 from public.builders where id=current_setting('takeoff.builder_item')::uuid) then raise exception 'Viewer cannot read directory'; end if;
 update public.builders set active=false where id=current_setting('takeoff.builder_item')::uuid;
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Viewer edited directory'; end if;
 begin
  insert into public.builders(name) values('Viewer must not create this');
  raise exception 'Viewer could add';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.builder_admin'),'role','authenticated')::text,true);
do $$ begin
 if private.takeoff_role()<>'admin' then raise exception 'Admin fixture failed'; end if;
 update public.builders set name='Admin Renamed Company' where id=current_setting('takeoff.builder_item')::uuid;
 if not found then raise exception 'Admin cannot edit'; end if;
 update public.builders set active=false where id=current_setting('takeoff.builder_item')::uuid;
 insert into public.builders(name) values('Admin Added Company');
end $$;
set local role anon;
do $$ begin
 begin perform * from public.builders; raise exception 'Anonymous directory read'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'Builder role, duplicate, rename, remove and restore checks passed; fixtures rolled back.' result;
