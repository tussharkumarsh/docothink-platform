-- Reviews: only the patient of a recently completed appointment, once; comments hidden until approved;
-- ratings aggregate onto the doctor; the public view never exposes patient ids.

-- Fixtures (as postgres): completed, old-completed and cancelled appointments for Emily with Dr Mehta.
insert into public.appointments (id, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone,
  patient_timezone, currency, fee_snapshot, fee_amount, amount_paid, commission_bps)
values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   'video', 'confirmed', now() - interval '2 days', now() - interval '2 days' + interval '20 minutes',
   'Asia/Kolkata', 'America/New_York', 'INR', '{"video": 100000}', 100000, 100000, 1000),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   'video', 'confirmed', now() - interval '31 days', now() - interval '31 days' + interval '20 minutes',
   'Asia/Kolkata', 'America/New_York', 'INR', '{"video": 100000}', 100000, 100000, 1000),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   'video', 'confirmed', now() - interval '3 days', now() - interval '3 days' + interval '20 minutes',
   'Asia/Kolkata', 'America/New_York', 'INR', '{"video": 100000}', 100000, 100000, 1000);
update public.appointments set status = 'in_progress'
where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002');
update public.appointments set status = 'completed'
where id in ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-00000000a002');
update public.appointments set status = 'cancelled' where id = '00000000-0000-4000-8000-00000000a003';

-- Emily reviews her completed appointment; the comment waits for moderation, the stars count now.
select tests.login('00000000-0000-4000-8000-000000000201');
select public.submit_review('00000000-0000-4000-8000-00000000a001', 5::smallint, 'Very thorough', false);
reset role;
select tests.assert((select comment_status from public.doctor_reviews where appointment_id = '00000000-0000-4000-8000-00000000a001') = 'pending',
  'comment starts pending');
select tests.assert((select rating_count from public.doctor_profiles where user_id = '00000000-0000-4000-8000-000000000101') = 1,
  'rating_count updated');
select tests.assert((select rating_avg from public.doctor_profiles where user_id = '00000000-0000-4000-8000-000000000101') = 5.00,
  'rating_avg updated');

-- Once only, own appointments only, ratings 1-5, completed within 30 days only.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.expect_error($$select public.submit_review('00000000-0000-4000-8000-00000000a001', 4::smallint, null, false)$$, 'REVIEW_EXISTS');
select tests.expect_error($$select public.submit_review('00000000-0000-4000-8000-00000000a002', 6::smallint, null, false)$$, 'INVALID_RATING');
select tests.expect_error($$select public.submit_review('00000000-0000-4000-8000-00000000a002', 4::smallint, null, false)$$, 'REVIEW_NOT_ALLOWED');
select tests.expect_error($$select public.submit_review('00000000-0000-4000-8000-00000000a003', 4::smallint, null, false)$$, 'REVIEW_NOT_ALLOWED');
reset role;
select tests.login('00000000-0000-4000-8000-000000000202');
select tests.expect_error($$select public.submit_review('00000000-0000-4000-8000-00000000a001', 4::smallint, null, false)$$, 'FORBIDDEN');
reset role;

-- Public view: name as "First L.", no comment before approval, no patient id column at all.
select tests.login_anon();
select tests.assert((select reviewer_name from public.public_doctor_reviews where doctor_id = '00000000-0000-4000-8000-000000000101') = 'Emily C.',
  'reviewer shown as first name + last initial');
select tests.assert((select comment from public.public_doctor_reviews where doctor_id = '00000000-0000-4000-8000-000000000101') is null,
  'pending comment hidden from public');
select tests.expect_error('select * from public.doctor_reviews', 'permission denied');
reset role;
select tests.assert(not exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'public_doctor_reviews' and column_name = 'patient_id'),
  'public view has no patient_id');

-- The doctor cannot read the pending comment directly.
select tests.login('00000000-0000-4000-8000-000000000101');
select tests.assert(not exists (select 1 from public.doctor_reviews where comment is not null),
  'doctor cannot read review rows directly');
reset role;

-- Moderation: patients can't, admins can; hiding keeps the stars.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.expect_error($$select public.moderate_review((select id from public.doctor_reviews limit 1), 'approved')$$, 'FORBIDDEN');
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
select public.moderate_review((select id from public.doctor_reviews where appointment_id = '00000000-0000-4000-8000-00000000a001'), 'approved');
reset role;
select tests.login_anon();
select tests.assert((select comment from public.public_doctor_reviews where doctor_id = '00000000-0000-4000-8000-000000000101') = 'Very thorough',
  'approved comment visible to public');
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
select public.moderate_review((select id from public.doctor_reviews where appointment_id = '00000000-0000-4000-8000-00000000a001'), 'hidden');
reset role;
select tests.assert((select comment from public.public_doctor_reviews where doctor_id = '00000000-0000-4000-8000-000000000101') is null,
  'hidden comment not public');
select tests.assert((select rating_count from public.doctor_profiles where user_id = '00000000-0000-4000-8000-000000000101') = 1,
  'hidden review still counts toward stars');

-- Anonymous reviews show no name.
update public.doctor_reviews set is_anonymous = true where appointment_id = '00000000-0000-4000-8000-00000000a001';
select tests.assert((select reviewer_name from public.public_doctor_reviews where doctor_id = '00000000-0000-4000-8000-000000000101') = 'Anonymous patient',
  'anonymous review shows no name');

-- Demo flags exist and default to false.
select tests.assert((select bool_and(not is_demo) from public.profiles), 'profiles.is_demo defaults false');
select tests.assert((select bool_and(not is_demo) from public.doctor_profiles), 'doctor_profiles.is_demo defaults false');
