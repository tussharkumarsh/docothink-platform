-- Private doctor details: country-specific validation, re-verification on bank/tax change, who can read,
-- masked admin view, audited reveal, and limits on the new public profile lists.

-- Dr Mehta (IN) saves valid details: pending review.
select tests.login('00000000-0000-4000-8000-000000000101');
select tests.assert(public.save_private_details(jsonb_build_object(
  'address_line1', '12 MG Road', 'city', 'Delhi', 'postal_code', '110001', 'country', 'IN',
  'account_holder_name', 'Anjali Mehta', 'bank_name', 'State Bank of India', 'bank_country', 'IN',
  'account_number', '123456789012', 'ifsc', 'SBIN0001234', 'pan', 'ABCDE1234F')) = 'pending', 'valid IN details go to pending');
select tests.expect_error($$select public.save_private_details('{"bank_country": "IN", "account_holder_name": "A", "bank_name": "B", "account_number": "123456789012", "ifsc": "SBIN1234", "pan": "ABCDE1234F"}')$$, 'INVALID_IFSC');
select tests.expect_error($$select public.save_private_details('{"bank_country": "IN", "account_holder_name": "A", "bank_name": "B", "account_number": "123456789012", "ifsc": "SBIN0001234", "pan": "ABCD1234F"}')$$, 'INVALID_PAN');
reset role;

-- Dr Clarke (GB): an IFSC on a UK account is rejected; valid UK details are accepted.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.expect_error($$select public.save_private_details('{"bank_country": "GB", "account_holder_name": "J Clarke", "bank_name": "Barclays", "account_number": "12345678", "sort_code": "123456", "ifsc": "SBIN0001234"}')$$, 'MISMATCHED_FIELDS');
select tests.assert(public.save_private_details('{"bank_country": "GB", "account_holder_name": "J Clarke", "bank_name": "Barclays", "account_number": "12345678", "sort_code": "123456"}') = 'pending',
  'valid GB details go to pending');
reset role;

-- Admin verifies; an address-only change keeps verification, a bank change resets it.
select tests.login('00000000-0000-4000-8000-000000000001');
select public.review_private_details('00000000-0000-4000-8000-000000000101', 'verify', null,
  (select submitted_at from public.admin_doctor_bank_masked where doctor_id = '00000000-0000-4000-8000-000000000101'));
select tests.expect_error($$select public.review_private_details('00000000-0000-4000-8000-000000000102', 'request_changes', '  ', now())$$, 'NOTE_REQUIRED');
reset role;
select tests.assert((select kyc_status from public.doctor_private_details where doctor_id = '00000000-0000-4000-8000-000000000101') = 'verified', 'verified');
select tests.login('00000000-0000-4000-8000-000000000101');
select public.save_private_details((select to_jsonb(d) - 'doctor_id' - 'kyc_status' - 'kyc_note' - 'verified_by' - 'verified_at' - 'submitted_at' - 'updated_at'
  from public.doctor_private_details d where doctor_id = '00000000-0000-4000-8000-000000000101') || '{"city": "Mumbai"}');
reset role;
select tests.assert((select kyc_status from public.doctor_private_details where doctor_id = '00000000-0000-4000-8000-000000000101') = 'verified',
  'address-only change keeps verification');
select tests.login('00000000-0000-4000-8000-000000000101');
select public.save_private_details((select to_jsonb(d) - 'doctor_id' - 'kyc_status' - 'kyc_note' - 'verified_by' - 'verified_at' - 'submitted_at' - 'updated_at'
  from public.doctor_private_details d where doctor_id = '00000000-0000-4000-8000-000000000101') || '{"account_number": "999988887777"}');
reset role;
select tests.assert((select kyc_status from public.doctor_private_details where doctor_id = '00000000-0000-4000-8000-000000000101') = 'pending',
  'bank change resets to pending');

-- Nobody else reads the row: patient, another doctor, anon.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.assert(not exists (select 1 from public.doctor_private_details), 'patient sees no private details');
reset role;
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.assert(not exists (select 1 from public.doctor_private_details where doctor_id = '00000000-0000-4000-8000-000000000101'),
  'another doctor cannot read');
reset role;
select tests.login_anon();
select tests.expect_error('select * from public.doctor_private_details', 'permission denied');
reset role;

-- An admin without finance.manage sees nothing and can do nothing.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000196', 'doctors.admin@docothink.test', '{"full_name": "Doctors Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000196';
insert into public.admin_permissions (user_id, permission) values ('00000000-0000-4000-8000-000000000196', 'doctors.manage');
select tests.login('00000000-0000-4000-8000-000000000196');
select tests.assert(not exists (select 1 from public.admin_doctor_bank_masked), 'non-finance admin sees no bank details');
select tests.expect_error($$select * from public.reveal_bank_details('00000000-0000-4000-8000-000000000101')$$, 'FORBIDDEN');
select tests.expect_error($$select public.review_private_details('00000000-0000-4000-8000-000000000101', 'verify', null, now())$$, 'FORBIDDEN');
reset role;

-- Finance admin: masked by default, full values only via audited reveal.
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.assert((select account_masked from public.admin_doctor_bank_masked where doctor_id = '00000000-0000-4000-8000-000000000101') = '••••7777',
  'account number masked to last 4');
select tests.assert(not exists (select 1 from public.admin_doctor_bank_masked m
  where to_jsonb(m)::text like '%999988887777%' or to_jsonb(m)::text like '%ABCDE1234F%'), 'masked view never contains full account number or PAN');
select tests.assert((select account_number from public.reveal_bank_details('00000000-0000-4000-8000-000000000101')) = '999988887777', 'reveal returns full number');
reset role;
select tests.assert(exists (select 1 from public.audit_logs where action = 'bank.reveal' and entity_id = '00000000-0000-4000-8000-000000000101'),
  'reveal is audited');

-- Public profile lists: limits enforced.
update public.doctor_profiles set services = (select array_agg('Service ' || g) from generate_series(1, 40) g)
where user_id = '00000000-0000-4000-8000-000000000101';
select tests.expect_error($$update public.doctor_profiles set services = (select array_agg('Service ' || g) from generate_series(1, 41) g)
  where user_id = '00000000-0000-4000-8000-000000000101'$$, 'check');
select tests.assert(exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'credential_kind' and e.enumlabel = 'bank_proof'),
  'bank_proof credential kind exists');

-- Review is tied to the version the admin looked at: details changed since then cannot be verified.
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.expect_error($$select public.review_private_details('00000000-0000-4000-8000-000000000101', 'verify', null, now() - interval '1 day')$$, 'STALE_DETAILS');
reset role;

-- After "changes requested", re-sending the same complete details puts them back in the queue.
select tests.login('00000000-0000-4000-8000-000000000001');
select public.review_private_details('00000000-0000-4000-8000-000000000102', 'request_changes', 'Please upload a clearer cheque',
  (select submitted_at from public.admin_doctor_bank_masked where doctor_id = '00000000-0000-4000-8000-000000000102'));
reset role;
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.assert(public.save_private_details('{"bank_country": "GB", "account_holder_name": "J Clarke", "bank_name": "Barclays", "account_number": "12345678", "sort_code": "123456"}') = 'pending',
  'unchanged details can be resubmitted after changes were requested');
reset role;

-- Bank proof shows the full account number, so among admins only finance can see it.
insert into public.doctor_credentials (doctor_id, kind, storage_path, file_name, mime_type, size_bytes)
values ('00000000-0000-4000-8000-000000000101', 'bank_proof', '00000000-0000-4000-8000-000000000101/cheque.pdf', 'cheque.pdf', 'application/pdf', 1000);
insert into public.doctor_credentials (doctor_id, kind, storage_path, file_name, mime_type, size_bytes)
values ('00000000-0000-4000-8000-000000000101', 'medical_degree', '00000000-0000-4000-8000-000000000101/degree.pdf', 'degree.pdf', 'application/pdf', 1000);
select tests.login('00000000-0000-4000-8000-000000000196');
select tests.assert(not exists (select 1 from public.doctor_credentials where kind = 'bank_proof'), 'doctors-only admin cannot see bank proof');
select tests.assert(exists (select 1 from public.doctor_credentials where kind = 'medical_degree'), 'doctors-only admin still sees other credentials');
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.assert(exists (select 1 from public.doctor_credentials where kind = 'bank_proof'), 'finance admin sees bank proof');
reset role;
select tests.login('00000000-0000-4000-8000-000000000101');
select tests.assert(exists (select 1 from public.doctor_credentials where kind = 'bank_proof'), 'doctor sees own bank proof');
reset role;
