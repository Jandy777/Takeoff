-- Verify actual RLS for external viewers, editors, and administrators. All
-- accounts, grants, and drawings are transactional fixtures and roll back.
begin;
select set_config('takeoff.roles_admin',gen_random_uuid()::text,true);
select set_config('takeoff.roles_external',gen_random_uuid()::text,true);
select set_config('takeoff.roles_other',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at,raw_user_meta_data) values
  (current_setting('takeoff.roles_admin')::uuid,'takeoff-role-admin@concretews.com','authenticated','authenticated',now(),now(),now(),'{}'),
  (current_setting('takeoff.roles_external')::uuid,'takeoff-role-external@example.invalid','authenticated','authenticated',now(),now(),now(),'{"role":"admin","employee_id":"hector-reyes"}'),
  (current_setting('takeoff.roles_other')::uuid,'takeoff-role-other@example.invalid','authenticated','authenticated',now(),now(),now(),'{}');
insert into public.team_access(email,role) values('takeoff-role-admin@concretews.com','admin');
-- Temporarily bind ownership to the fixture inside this transaction only.
update public.team_members set is_owner=false where is_owner;
update public.team_members set is_owner=true where user_id=current_setting('takeoff.roles_admin')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_external'),'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin
  if private.takeoff_role()<>'viewer' then raise exception 'External signup did not begin as viewer'; end if;
  begin insert into public.team_access(email,role) values('takeoff-role-external@example.invalid','admin'); raise exception 'Viewer could promote themselves'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_admin'),'role','authenticated')::text,true);
insert into public.team_access(email,role) values('takeoff-role-external@example.invalid','estimator');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_external'),'role','authenticated')::text,true);
do $$ begin
  if private.takeoff_role()<>'estimator' then raise exception 'Administrator could not grant external editing'; end if;
  insert into public.drawings(customer_name,project_name,print_revision,document) values('Role Test','External Editing','Test','{}');
  begin insert into public.team_access(email,role) values('takeoff-role-other@example.invalid','admin'); raise exception 'Estimator could manage team roles'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Auth synchronization cannot silently undo an administrator's external grant.
update auth.users set email_confirmed_at=email_confirmed_at where id=current_setting('takeoff.roles_external')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_external'),'role','authenticated')::text,true);
do $$ begin if private.takeoff_role()<>'estimator' then raise exception 'External editing was reset by Auth synchronization'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_admin'),'role','authenticated')::text,true);
update public.team_access set role='admin' where email='takeoff-role-external@example.invalid';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_external'),'role','authenticated')::text,true);
do $$ begin
  if private.takeoff_role()<>'admin' then raise exception 'External administrator role is not effective'; end if;
  if private.takeoff_owner() then raise exception 'An external admin gained owner authority'; end if;
  begin insert into public.team_access(email,role) values('takeoff-role-other@example.invalid','estimator'); raise exception 'A non-owner admin could grant external editing'; exception when insufficient_privilege then null; end;
  begin update public.team_members set is_owner=true where user_id=auth.uid(); raise exception 'An administrator could claim ownership'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_admin'),'role','authenticated')::text,true);
update public.team_access set role='viewer' where email='takeoff-role-external@example.invalid';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.roles_external'),'role','authenticated')::text,true);
do $$ declare affected integer; begin
  if private.takeoff_role()<>'viewer' then raise exception 'External role revocation did not take effect'; end if;
  update public.drawings set print_revision='Wrong' where customer_name='Role Test'; get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Revoked editor still edits drawings'; end if;
end $$;
reset role;
-- The final active administrator remains protected, regardless of domain.
update public.team_access set role='admin' where email='takeoff-role-external@example.invalid';
update public.team_members set access_enabled=false where role='admin' and user_id<>current_setting('takeoff.roles_external')::uuid;
do $$ begin
  begin update public.team_members set access_enabled=false where user_id=current_setting('takeoff.roles_external')::uuid; raise exception 'The last active administrator could be disabled';
  exception when raise_exception then if SQLERRM<>'Keep at least one active administrator.' then raise; end if; end;
end $$;
rollback;
select 'External default viewing, owner-only overrides, protected ownership, editor/admin RLS, Auth synchronization, revocation, and final-admin protection passed; fixtures rolled back.' as result;
