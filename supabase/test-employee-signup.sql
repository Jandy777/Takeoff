-- Signup without ownership verification must never automatically grant editing.
-- Confirmed timestamps simulate immediate signup; all fixtures roll back.
begin;
insert into private.employee_directory(id,full_name) values('__takeoff-signup-test','Signup Test Employee');
select set_config('takeoff.signup_employee',gen_random_uuid()::text,true);
select set_config('takeoff.signup_external',gen_random_uuid()::text,true);
select set_config('takeoff.signup_duplicate',gen_random_uuid()::text,true);
select set_config('takeoff.signup_preapproved',gen_random_uuid()::text,true);
insert into public.team_access(email,role) values('takeoff-preapproved-test@concretews.com','estimator');
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at,raw_user_meta_data) values
(current_setting('takeoff.signup_employee')::uuid,'takeoff-signup-test@concretews.com','authenticated','authenticated',now(),now(),now(),'{"employee_id":"__takeoff-signup-test","role":"admin"}'),
(current_setting('takeoff.signup_external')::uuid,'takeoff-signup-test@example.invalid','authenticated','authenticated',now(),now(),now(),'{"employee_id":"__takeoff-signup-test","role":"admin"}'),
(current_setting('takeoff.signup_duplicate')::uuid,'takeoff-duplicate-signup-test@concretews.com','authenticated','authenticated',now(),now(),now(),'{"employee_id":"__takeoff-signup-test"}'),
(current_setting('takeoff.signup_preapproved')::uuid,'takeoff-preapproved-test@concretews.com','authenticated','authenticated',now(),now(),now(),'{"role":"admin"}');
do $$ begin
  if exists(select 1 from public.team_members where user_id in(current_setting('takeoff.signup_employee')::uuid,current_setting('takeoff.signup_external')::uuid,current_setting('takeoff.signup_duplicate')::uuid,current_setting('takeoff.signup_preapproved')::uuid) and (role<>'viewer' or employee_id is not null)) then
    raise exception 'A typed email, name, metadata, or older preapproval granted editing';
  end if;
  if not exists(select 1 from public.team_members where user_id=current_setting('takeoff.signup_employee')::uuid and requested_employee_id='__takeoff-signup-test' and display_name='Signup Test Employee') then
    raise exception 'The employee request was not recorded for review';
  end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_employee'),'role','authenticated')::text,true);
do $$ begin
  if private.takeoff_role()<>'viewer' then raise exception 'Employee request bypassed approval'; end if;
  begin perform public.claim_employee_account('__takeoff-signup-test'); raise exception 'Self-service elevation remains available';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.team_access(email,role) values('takeoff-signup-test@concretews.com','estimator');
do $$ begin
  if not exists(select 1 from public.team_members where user_id=current_setting('takeoff.signup_employee')::uuid and role='estimator' and employee_id='__takeoff-signup-test') then raise exception 'Administrator approval failed'; end if;
  begin
    insert into public.team_access(email,role) values('takeoff-duplicate-signup-test@concretews.com','estimator');
    raise exception 'The same employee was approved twice';
  exception when raise_exception then if SQLERRM not like '%already has an approved account%' then raise; end if; end;
  if (select role from public.team_members where user_id=current_setting('takeoff.signup_external')::uuid)<>'viewer' then raise exception 'An external account gained editing without administrator action'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_employee'),'role','authenticated')::text,true);
do $$ begin
  if private.takeoff_role()<>'estimator' then raise exception 'Approved estimator cannot edit'; end if;
  insert into public.drawings(customer_name,project_name,print_revision,document) values('Signup Test','Employee Test','Test','{}');
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_external'),'role','authenticated')::text,true);
do $$ begin
  if not exists(select 1 from public.drawings where customer_name='Signup Test') then raise exception 'Viewer cannot read drawings'; end if;
  begin insert into public.drawings(customer_name,project_name,print_revision,document) values('Wrong','Wrong','Wrong','{}'); raise exception 'Viewer could create drawings';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.team_members set access_enabled=false where user_id=current_setting('takeoff.signup_external')::uuid;
update auth.users set email='takeoff-disabled-test@example.invalid' where id=current_setting('takeoff.signup_external')::uuid;
insert into public.team_access(email,role) values('takeoff-other-work-test@concretews.com','estimator');
update auth.users set email='takeoff-other-work-test@concretews.com' where id=current_setting('takeoff.signup_employee')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_external'),'role','authenticated')::text,true);
do $$ begin if private.takeoff_role() is not null then raise exception 'Disabled account regained access'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_employee'),'role','authenticated')::text,true);
do $$ begin if private.takeoff_role()<>'viewer' then raise exception 'Email change retained editing without approval'; end if; end $$;
reset role;
rollback;
select 'Immediate signup viewing, administrator approval, duplicate names, domain restrictions, revocation, and email changes passed; fixtures rolled back.' as result;
