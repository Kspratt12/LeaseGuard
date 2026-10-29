-- ADMIN ACTIVATION: run by the owner, by hand, in the Supabase SQL editor of the PRODUCTION project.
-- Do not run until ALL of these are true:
--   1. migration 20261031_admin_users.sql has been applied,
--   2. you have created your account at https://www.leaseguard.io/login and CLICKED the confirmation email
--      (so the address is verified and the password is one you set yourself),
--   3. you have read this file.
--
-- It adds exactly one row, only if that account exists AND its email is confirmed.
-- It never sets or reads a password.

insert into public.admin_users (user_id, note)
select id, 'owner'
from auth.users
where lower(email) = lower('OWNER-EMAIL-GOES-HERE')
  and email_confirmed_at is not null
on conflict (user_id) do nothing;

-- Check: should return one row (no email shown).
select count(*) as admins from public.admin_users;

-- To REMOVE administrator access later:
--   delete from public.admin_users where user_id = (select id from auth.users where lower(email) = lower('OWNER-EMAIL-GOES-HERE'));
