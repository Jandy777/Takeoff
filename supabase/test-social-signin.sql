-- OAuth-style users arrive already verified, without employee metadata.
-- Fixtures and claims roll back. This does not contact Microsoft or Google.
begin;
insert into private.employee_directory(id,full_name) values
  ('__takeoff-social-test','Social Test Employee'),('__takeoff-social-other','Other Social Employee');
select set_config('takeoff.social_work',gen_random_uuid()::text,true);
select set_config('takeoff.social_viewer',gen_random_uuid()::text,true);
select set_config('takeoff.social_duplicate',gen_random_uuid()::text,true);
select set_config('takeoff.social_unverified',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at) values
  (current_setting('takeoff.social_work')::uuid,'takeoff-social-test@concretews.com','authenticated','authenticated',now(),now(),now()),
  (current_setting('takeoff.social_viewer')::uuid,'takeoff-social-test@example.invalid','authenticated','authenticated',now(),now(),now()),
  (current_setting('takeoff.social_duplicate')::uuid,'takeoff-social-duplicate@concretews.com','authenticated','authenticated',now(),now(),now()),
  (current_setting('takeoff.social_unverified')::uuid,'takeoff-social-unverified@concretews.com','authenticated','authenticated',null,now(),now());
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.social_work'),'role','authenticated')::text,true);
do $$ begin
  if private.takeoff_role()<>'viewer' then raise exception 'New OAuth account must begin as viewer'; end if;
  perform public.claim_employee_account('__takeoff-social-test');
  if private.takeoff_role()<>'estimator' then raise exception 'Verified work account could not complete employee setup'; end if;
  perform public.claim_employee_account('__takeoff-social-test');
  begin
    perform public.claim_employee_account('__takeoff-social-other');
    raise exception 'Existing employee could claim a second name';
  exception when raise_exception then
    if SQLERRM not like '%different employee%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.social_viewer'),'role','authenticated','email','forged@concretews.com','user_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin
  begin
    perform public.claim_employee_account('__takeoff-social-other');
    raise exception 'Personal account claimed an employee name';
  exception when insufficient_privilege then null; end;
  if private.takeoff_role()<>'viewer' then raise exception 'Google-style external user gained editing'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.social_unverified'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.claim_employee_account('__takeoff-social-other'); raise exception 'Unverified email claimed employee';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.social_duplicate'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.claim_employee_account('__takeoff-social-test'); raise exception 'Duplicate employee claim succeeded';
  exception when raise_exception then if SQLERRM not like '%already has an account%' then raise; end if; end;
  begin perform public.claim_employee_account('not-a-real-employee'); raise exception 'Unknown employee claim succeeded';
  exception when raise_exception then if SQLERRM not like '%employee list%' then raise; end if; end;
end $$;
reset role;
insert into public.team_access(email,role) values('takeoff-social-test@concretews.com','viewer'),('takeoff-social-duplicate@concretews.com','viewer');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.social_work'),'role','authenticated')::text,true);
select public.claim_employee_account('__takeoff-social-test');
do $$ begin if private.takeoff_role()<>'viewer' then raise exception 'Repeated claim undid admin demotion'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.social_duplicate'),'role','authenticated')::text,true);
select public.claim_employee_account('__takeoff-social-other');
do $$ begin if private.takeoff_role()<>'viewer' then raise exception 'Initial claim ignored admin viewer override'; end if; end $$;
reset role;
update public.team_members set access_enabled=false where user_id=current_setting('takeoff.social_work')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.social_work'),'role','authenticated')::text,true);
do $$ begin
  begin perform public.claim_employee_account('__takeoff-social-test'); raise exception 'Disabled account regained employee access';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.claim_employee_account('__takeoff-social-test'); raise exception 'Signed-out caller used employee setup';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'OAuth employee setup, external viewing, duplicate claims, admin overrides, revocation, and signed-out access checks passed; fixtures rolled back.' as result;
