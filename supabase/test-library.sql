-- Transactional checks: all fixtures and changes are rolled back.
begin;
select set_config('takeoff.test_admin', gen_random_uuid()::text, true);
select set_config('takeoff.test_estimator', gen_random_uuid()::text, true);
select set_config('takeoff.test_viewer', gen_random_uuid()::text, true);
select set_config('takeoff.test_outsider', gen_random_uuid()::text, true);
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at) values
  (current_setting('takeoff.test_admin')::uuid,'takeoff-admin-test@concretews.com','authenticated','authenticated',now(),now(),now()),
  (current_setting('takeoff.test_estimator')::uuid,'takeoff-estimator-test@concretews.com','authenticated','authenticated',now(),now(),now()),
  (current_setting('takeoff.test_viewer')::uuid,'takeoff-viewer-test@concretews.com','authenticated','authenticated',now(),now(),now()),
  (current_setting('takeoff.test_outsider')::uuid,'takeoff-outsider-test@example.invalid','authenticated','authenticated',now(),now(),now());
-- Administrators grant roles after registration in the simple signup flow.
insert into public.team_access(email,role) values
  ('takeoff-admin-test@concretews.com','admin'),
  ('takeoff-estimator-test@concretews.com','estimator'),
  ('takeoff-viewer-test@concretews.com','viewer');
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('takeoff.test_estimator'), 'role','authenticated')::text, true);
do $$
declare item public.drawings; next_item public.drawings; affected integer;
begin
  insert into public.drawings(customer_name,project_name,city,estimator_name,print_revision,model_name,elevation,job_type,document)
  values('Test Builder','Shared Development','Naperville','Jake','Rev 1','Aspen','A','tract','{"walls":[],"pads":[]}'::jsonb) returning * into item;
  perform set_config('takeoff.test_drawing',item.id::text,true);
  update public.drawings set document = '{"walls":[],"pads":[],"texts":[{"id":1,"text":"Saved note"}]}'::jsonb where id=item.id and version=1;
  update public.drawings set elevation='SHOULD NOT SAVE' where id=item.id and version=1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale save overwrote a newer drawing'; end if;
  select * into item from public.drawings where id=item.id;
  if item.version <> 2 or item.elevation <> 'A' then raise exception 'Save/reload version check failed'; end if;
  if item.city <> 'Naperville' or item.estimator_name <> 'Jake' then raise exception 'City and estimator did not survive save/reload'; end if;
  select * into next_item from public.new_drawing_revision(item.id,2,'{"customer_name":"Test Builder","project_name":"Shared Development","print_revision":"Rev 2","model_name":"Aspen","elevation":"A","job_type":"tract"}');
  if next_item.id = item.id or next_item.document <> item.document then raise exception 'Revision was not an independent complete copy'; end if;
  if next_item.city <> 'Naperville' or next_item.estimator_name <> 'Jake' then raise exception 'City and estimator did not carry into the new revision'; end if;
  if not (select locked from public.drawings where id=item.id) then raise exception 'Previous revision was not preserved'; end if;
  update public.drawings set elevation='SHOULD NOT SAVE' where id=item.id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Preserved revision was editable'; end if;
  -- A preserved revision can also be used as the source of a new draft.
  select * into next_item from public.new_drawing_revision(item.id,3,'{"customer_name":"Test Builder","project_name":"Shared Development","city":"Aurora","estimator_name":"Casey","print_revision":"Alternate","model_name":"Aspen","elevation":"B","job_type":"tract"}');
  if next_item.elevation <> 'B' then raise exception 'Alternate elevation failed'; end if;
  if next_item.city <> 'Aurora' or next_item.estimator_name <> 'Casey' then raise exception 'New revision did not save changed city and estimator'; end if;
  begin
    update public.team_members set role='admin' where user_id=auth.uid();
    raise exception 'Estimator could change their own access';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.team_access(email,role) values('unauthorized@concretews.com','admin');
    raise exception 'Estimator could add an administrator';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('takeoff.test_viewer'), 'role','authenticated')::text, true);
do $$ declare affected integer; begin
  if (select count(*) from public.drawings where customer_name='Test Builder' and project_name='Shared Development') <> 3 then raise exception 'Viewer cannot see saved drawings'; end if;
  update public.drawings set elevation='SHOULD NOT SAVE' where not locked;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Viewer could edit'; end if;
  begin
    insert into public.drawings(customer_name,project_name,print_revision,document) values('Wrong','Wrong','Wrong','{}');
    raise exception 'Viewer could create';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.team_access) then raise exception 'Viewer can read allowed account list'; end if;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('takeoff.test_outsider'), 'role','authenticated')::text, true);
do $$ declare affected integer; begin
  if not exists(select 1 from public.drawings) then raise exception 'Verified external signup cannot view drawings'; end if;
  update public.drawings set elevation='SHOULD NOT SAVE' where not locked;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'External viewer could edit'; end if;
  begin
    insert into public.drawings(customer_name,project_name,print_revision,document) values('Wrong','Wrong','Wrong','{}');
    raise exception 'External viewer could create';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('takeoff.test_admin'), 'role','authenticated')::text, true);
update public.team_members set access_enabled=false where user_id=current_setting('takeoff.test_outsider')::uuid;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('takeoff.test_outsider'), 'role','authenticated')::text, true);
do $$ begin
  if exists(select 1 from public.drawings) then raise exception 'Disabled viewer still has access'; end if;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.drawings;
    raise exception 'Signed-out user can read drawings';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'Save, reopen, revision preservation, conflicts, estimator/viewer/outsider permissions passed; fixtures rolled back.' as result;
