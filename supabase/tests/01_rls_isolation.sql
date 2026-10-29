-- RLS: identity, privilege escalation, directory visibility, clinical isolation.

-- Anonymous visitors see only approved doctors and active specialties, and no personal data.
select tests.login_anon();
select tests.assert((select count(*) from public.doctor_profiles) = 3, 'anon sees the 3 approved doctors');
select tests.assert((select count(*) from public.specialties) >= 25, 'anon sees specialties');
select tests.expect_error('select * from public.profiles', 'permission denied');
select tests.expect_error('select * from public.patient_medical_profiles', 'permission denied');
select tests.expect_error('select * from public.appointments', 'permission denied');
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000102', now(), 'audio', 'x', 'UTC')$$, 'permission denied');
reset role;

-- A doctor still in draft is invisible publicly.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000199', 'draft.doctor@docothink.test', '{"signup_role": "doctor", "full_name": "Draft Doctor"}');
select tests.assert((select role from public.profiles where id = '00000000-0000-4000-8000-000000000199') = 'doctor',
  'signup_role doctor creates a doctor profile');
select tests.assert((select application_status from public.doctor_profiles where user_id = '00000000-0000-4000-8000-000000000199') = 'draft',
  'new doctors start in draft');
select tests.login_anon();
select tests.assert(not exists (select 1 from public.doctor_profiles where user_id = '00000000-0000-4000-8000-000000000199'),
  'draft doctor hidden from public');
reset role;

-- Nobody can sign themselves up as admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000198', 'sneaky@docothink.test', '{"signup_role": "admin"}');
select tests.assert((select role from public.profiles where id = '00000000-0000-4000-8000-000000000198') = 'patient',
  'signup_role admin is ignored');

-- Patients see only themselves.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.assert((select count(*) from public.profiles) = 1, 'patient sees only own profile');
select tests.assert((select count(*) from public.patient_medical_profiles) = 1, 'patient sees only own medical profile');
select tests.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, 'permission denied');
select tests.expect_error($$update public.profiles set is_active = false where id = auth.uid()$$, 'permission denied');
update public.profiles set full_name = 'Emily J. Carter' where id = '00000000-0000-4000-8000-000000000202';
select tests.assert((select full_name from public.profiles where id = '00000000-0000-4000-8000-000000000201') = 'Emily Carter',
  'updating another user affects nothing');
update public.patient_medical_profiles set data = '{"allergies": {"has_allergies": true}}' where patient_id = auth.uid();
select tests.assert((select version from public.patient_medical_profiles where patient_id = auth.uid()) = 2,
  'medical profile updates bump the version');
select tests.expect_error($$update public.profiles set timezone = 'IST' where id = auth.uid()$$, 'check constraint');
select tests.expect_error($$select public.update_platform_setting('booking', '{}')$$, 'FORBIDDEN');
select tests.expect_error($$select public.review_doctor_application('00000000-0000-4000-8000-000000000199', 'approve')$$, 'FORBIDDEN');
select tests.expect_error($$select public.confirm_payment(gen_random_uuid(), 'x', 1, 'USD')$$, 'permission denied');
select tests.expect_error($$select public.sweep_appointments()$$, 'permission denied');
select tests.expect_error($$select public.audit('x', 'y', 'z', '{}')$$, 'permission denied');
reset role;

-- A doctor without a treating relationship cannot read a patient's records.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.assert((select count(*) from public.patient_medical_profiles) = 0, 'doctor without appointment sees no medical profiles');
select tests.assert((select count(*) from public.profiles where role = 'patient') = 0, 'doctor without appointment sees no patients');
select tests.expect_error($$update public.doctor_profiles set application_status = 'approved' where user_id = auth.uid()$$, 'permission denied');
-- Registration details are locked after approval.
select tests.expect_error($$update public.doctor_profiles set registration_number = 'NEW-1' where user_id = auth.uid()$$, 'REGISTRATION_LOCKED');
-- Fee changes are recorded.
update public.doctor_profiles set fee_video = 5000 where user_id = auth.uid();
reset role;
select tests.assert((select count(*) from public.doctor_fee_history where doctor_id = '00000000-0000-4000-8000-000000000102') >= 2,
  'fee changes are written to history');

-- A patient-granted share gives access; revoking removes it.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('grant', public.share_records_with_doctor('00000000-0000-4000-8000-000000000103', 'Second opinion on my results')::text);
reset role;
select tests.login('00000000-0000-4000-8000-000000000103');
select tests.assert((select count(*) from public.patient_medical_profiles) = 1, 'shared doctor can read the medical profile');
reset role;
select tests.login('00000000-0000-4000-8000-000000000201');
select public.revoke_clinical_access(tests.get('grant')::uuid);
reset role;
select tests.login('00000000-0000-4000-8000-000000000103');
select tests.assert((select count(*) from public.patient_medical_profiles) = 0, 'access ends when the share is revoked');
reset role;

-- Admins without clinical.read cannot see clinical data.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000002', 'ops@docothink.test');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000002';
insert into public.admin_permissions (user_id, permission) values ('00000000-0000-4000-8000-000000000002', 'appointments.manage');
select tests.login('00000000-0000-4000-8000-000000000002');
select tests.assert((select count(*) from public.patient_medical_profiles where patient_id <> auth.uid()) = 0,
  'ops admin cannot read other people''s medical profiles');
select tests.assert((select count(*) from public.profiles) > 1, 'admin can see account profiles');
reset role;
