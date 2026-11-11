-- Explicit, authenticated employee setup after Microsoft OAuth.
-- Apply after employee-signup.sql. The caller can only claim their own account.
create function private.claim_employee_account(requested_employee text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  actual_email text;
  verified_at timestamptz;
  employee_name text;
  existing public.team_members;
  override_role text;
begin
  if caller is null then raise exception 'Sign in with your work account first.' using errcode='42501'; end if;
  select lower(email),email_confirmed_at into actual_email,verified_at from auth.users where id=caller;
  if verified_at is null or actual_email is null or actual_email !~ '^[^@[:space:]]+@concretews[.]com$' then
    raise exception 'Employee editing requires a verified @concretews.com work account.' using errcode='42501';
  end if;
  select full_name into employee_name from private.employee_directory where id=requested_employee;
  if employee_name is null then raise exception 'Choose your name from the employee list.'; end if;
  select * into existing from public.team_members where user_id=caller for update;
  if existing.user_id is null or not existing.access_enabled or not existing.registration_complete then
    raise exception 'This account cannot set up employee access. Contact your Takeoff administrator.' using errcode='42501';
  end if;
  if existing.employee_id=requested_employee then return; end if;
  if existing.employee_id is not null then raise exception 'This account is already linked to a different employee. Contact your Takeoff administrator.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('takeoff-employee:' || requested_employee,0));
  if exists(select 1 from public.team_members where employee_id=requested_employee and user_id<>caller) then
    raise exception 'This employee already has an account. Sign in to that account or contact your Takeoff administrator.';
  end if;
  select role into override_role from public.team_access where email=actual_email;
  update public.team_members set employee_id=requested_employee,display_name=employee_name,
    role=coalesce(override_role,case when existing.role='admin' then 'admin' else 'estimator' end)
  where user_id=caller;
end $$;
revoke all on function private.claim_employee_account(text) from public,anon,authenticated;
grant execute on function private.claim_employee_account(text) to authenticated;

-- The exposed entry point has no elevated privileges. The private helper must
-- read trusted Auth/roster records and write the caller's protected membership;
-- it checks the actual user, company domain, confirmation, revocation, and slot.
create function public.claim_employee_account(requested_employee text) returns void
language sql security invoker set search_path = '' as $$
  select private.claim_employee_account(requested_employee)
$$;
revoke all on function public.claim_employee_account(text) from public,anon,authenticated;
grant execute on function public.claim_employee_account(text) to authenticated;
