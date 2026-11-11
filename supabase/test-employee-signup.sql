-- Registration security checks; no emails are sent and all fixtures roll back.
begin;
do $$ begin
  if (select count(*) from private.employee_directory where id in ('hector-reyes','don-baggio','steve-martin','scott-martin','chuck-atkinson','randy-guenther','eric-oneil')) <> 7 then
    raise exception 'The seven requested employees were not seeded';
  end if;
end $$;
insert into private.employee_directory(id,full_name) values('__takeoff-signup-test','Signup Test Employee');
select set_config('takeoff.signup_employee',gen_random_uuid()::text,true);
select set_config('takeoff.signup_external',gen_random_uuid()::text,true);
select set_config('takeoff.signup_duplicate',gen_random_uuid()::text,true);
select set_config('takeoff.signup_spoof',gen_random_uuid()::text,true);
select set_config('takeoff.signup_unknown',gen_random_uuid()::text,true);

insert into auth.users(id,email,aud,role,created_at,updated_at,raw_user_meta_data) values
(current_setting('takeoff.signup_employee')::uuid,'takeoff-signup-test@concretews.com','authenticated','authenticated',now(),now(),'{"employee_id":"__takeoff-signup-test","role":"admin"}');
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at,raw_user_meta_data) values
(current_setting('takeoff.signup_external')::uuid,'takeoff-signup-test@example.invalid','authenticated','authenticated',now(),now(),now(),'{"employee_id":"__takeoff-signup-test","role":"admin"}'),
(current_setting('takeoff.signup_spoof')::uuid,'takeoff-signup-test@concretews.com.attacker.test','authenticated','authenticated',now(),now(),now(),'{"employee_id":"__takeoff-signup-test","role":"admin"}'),
(current_setting('takeoff.signup_unknown')::uuid,'takeoff-unknown-signup-test@concretews.com','authenticated','authenticated',now(),now(),now(),'{"employee_id":"not-in-directory","role":"admin"}');

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_employee'),'role','authenticated')::text,true);
do $$ begin
  if private.takeoff_role() is not null then raise exception 'Unverified work address gained access'; end if;
end $$;
reset role;
update auth.users set email_confirmed_at=now() where id=current_setting('takeoff.signup_employee')::uuid;
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at,raw_user_meta_data) values
(current_setting('takeoff.signup_duplicate')::uuid,'takeoff-duplicate-signup-test@concretews.com','authenticated','authenticated',now(),now(),now(),'{"employee_id":"__takeoff-signup-test","role":"admin"}');
do $$ begin
  if not exists(select 1 from public.team_members where user_id=current_setting('takeoff.signup_employee')::uuid and role='estimator' and employee_id='__takeoff-signup-test' and display_name='Signup Test Employee' and registration_complete) then
    raise exception 'Verified employee did not gain editing access with the correct name';
  end if;
  if exists(select 1 from public.team_members where user_id in (current_setting('takeoff.signup_external')::uuid,current_setting('takeoff.signup_spoof')::uuid,current_setting('takeoff.signup_unknown')::uuid,current_setting('takeoff.signup_duplicate')::uuid) and (role<>'viewer' or employee_id is not null)) then
    raise exception 'Untrusted metadata, spoofed domain, unknown name, or duplicate employee granted editing access';
  end if;
  begin
    insert into public.team_access(email,role) values('takeoff-elevated-test@example.invalid','estimator');
    raise exception 'An external address could be granted editing access';
  exception when check_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_employee'),'role','authenticated')::text,true);
do $$ begin
  if private.takeoff_role()<>'estimator' then raise exception 'Verified employee role not effective'; end if;
  insert into public.drawings(customer_name,project_name,print_revision,document) values('Signup Test','Employee Test','Test','{}');
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_external'),'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin
  if private.takeoff_role()<>'viewer' then raise exception 'External metadata changed effective role'; end if;
  if not exists(select 1 from public.drawings where customer_name='Signup Test') then raise exception 'Verified external account cannot view drawings'; end if;
  begin
    insert into public.drawings(customer_name,project_name,print_revision,document) values('Wrong','Wrong','Wrong','{}');
    raise exception 'External account could create a drawing';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Disabled accounts stay disabled through user-editable metadata/email changes.
update public.team_members set access_enabled=false where user_id=current_setting('takeoff.signup_external')::uuid;
update auth.users set email='takeoff-disabled-test@example.invalid',raw_user_meta_data='{"employee_id":"hector-reyes","role":"admin"}' where id=current_setting('takeoff.signup_external')::uuid;
-- Leaving the company domain removes editing even when a JWT still says work email.
update auth.users set email='takeoff-former-work-test@example.invalid' where id=current_setting('takeoff.signup_employee')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_external'),'role','authenticated')::text,true);
do $$ begin if private.takeoff_role() is not null then raise exception 'Disabled account regained access'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.signup_employee'),'role','authenticated','email','takeoff-signup-test@concretews.com')::text,true);
do $$ begin if private.takeoff_role()<>'viewer' then raise exception 'Old work-email JWT still grants editing after email change'; end if; end $$;
rollback;
select 'Employee verification, roster claims, external viewing, domain spoofing, role forgery, duplicate registration, revocation, and email changes passed; fixtures rolled back.' as result;
