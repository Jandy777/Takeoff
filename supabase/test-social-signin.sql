-- Google-style sign-ins always begin as viewers. Roll back all fixtures.
begin;
select set_config('takeoff.google_user',gen_random_uuid()::text,true);
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
values(current_setting('takeoff.google_user')::uuid,'takeoff-google-test@example.invalid','authenticated','authenticated',now(),now(),now(),'{"role":"admin","employee_id":"hector-reyes"}');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('takeoff.google_user'),'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin
  if private.takeoff_role()<>'viewer' then raise exception 'Personal Google-style signup gained editing'; end if;
  begin perform public.claim_employee_account('hector-reyes'); raise exception 'The retired self-service role endpoint remains available';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.drawings(customer_name,project_name,print_revision,document) values('Wrong','Wrong','Wrong','{}');
    raise exception 'Personal Google-style account could create drawings';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'Google-style viewer access and retired employee elevation checks passed; fixtures rolled back.' as result;
