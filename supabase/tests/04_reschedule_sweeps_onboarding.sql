-- Reschedule workflow with race revalidation, sweeps (no-shows), doctor onboarding, DST consistency.

select tests.put('slotA', tests.next_slot('Europe/London', array[1, 2, 3, 4, 5], '10:00', 3)::text);
select tests.put('slotB', tests.next_slot('Europe/London', array[1, 2, 3, 4, 5], '10:20', 3)::text);
select tests.put('slotC', tests.next_slot('Europe/London', array[1, 2, 3, 4, 5], '10:40', 3)::text);

select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('appt', (public.book_appointment('00000000-0000-4000-8000-000000000102',
  tests.get('slotA')::timestamptz, 'chat', 'Headaches', 'America/New_York')).id::text);
select tests.put('pay', (public.create_payment_record(tests.get('appt')::uuid, 'booking')).id::text);
reset role;
select tests.login_service();
select public.confirm_payment(tests.get('pay')::uuid, 'pi_r1', 2500, 'GBP');
reset role;

-- Patient requests slot B; the original stays confirmed and held.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('req', (public.request_reschedule(tests.get('appt')::uuid, tests.get('slotB')::timestamptz, 'Work meeting')).id::text);
select tests.expect_error($$select public.request_reschedule(tests.get('appt')::uuid, tests.get('slotC')::timestamptz, 'again')$$, 'REQUEST_ALREADY_PENDING');
select tests.expect_error($$update public.appointment_change_requests set status = 'approved'$$, 'permission denied');
select tests.expect_error($$select public.decide_change_request(tests.get('req')::uuid, true)$$, 'FORBIDDEN');
reset role;
select tests.assert((select status::text || '@' || (start_at = tests.get('slotA')::timestamptz)::text from public.appointments
  where id = tests.get('appt')::uuid) = 'confirmed@true', 'original slot protected while pending');

-- Meanwhile another patient books slot B (it was never held by the request).
select tests.login('00000000-0000-4000-8000-000000000202');
select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slotB')::timestamptz, 'video', 'Back pain', 'Europe/London');
-- Original slot A is still taken.
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slotA')::timestamptz, 'video', 'x', 'Europe/London')$$, 'SLOT_TAKEN');
reset role;

-- Admin approval revalidates and fails safely; nothing changes.
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.expect_error($$select public.decide_change_request(tests.get('req')::uuid, true)$$, 'SLOT_TAKEN');
select public.decide_change_request(tests.get('req')::uuid, false, 'Requested time no longer available');
reset role;
select tests.assert((select start_at from public.appointments where id = tests.get('appt')::uuid) = tests.get('slotA')::timestamptz,
  'rejected request leaves the appointment unchanged');

-- Second request to slot C is approved atomically: moves, counts, and frees slot A.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('req2', (public.request_reschedule(tests.get('appt')::uuid, tests.get('slotC')::timestamptz, 'Still busy')).id::text);
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
select public.decide_change_request(tests.get('req2')::uuid, true, 'Approved');
reset role;
select tests.assert((select (start_at = tests.get('slotC')::timestamptz)::text || ':' || reschedule_count || ':' || status
  from public.appointments where id = tests.get('appt')::uuid) = 'true:1:confirmed', 'rescheduled to slot C');
select tests.assert((select count(*) from public.appointment_events where appointment_id = tests.get('appt')::uuid and event = 'rescheduled') = 1,
  'reschedule recorded');
select tests.assert((select count(*) from public.email_outbox where template = 'reschedule_approved') = 2, 'both parties notified');
update public.appointments set status = 'expired' where patient_id = '00000000-0000-4000-8000-000000000202' and status = 'pending_payment';
select tests.login('00000000-0000-4000-8000-000000000202');
select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slotA')::timestamptz, 'video', 'Back pain', 'Europe/London');
reset role;

-- Sweeps: patient missed it → no_show; doctor missed it → cancelled with full refund.
insert into public.appointments (id, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone,
  patient_timezone, currency, fee_snapshot, fee_amount, amount_paid, commission_bps)
values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103',
   'video', 'confirmed', now() - interval '3 hours', now() - interval '150 minutes', 'America/New_York', 'America/New_York',
   'USD', '{"video": 9000}', 9000, 9000, 1000),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000103',
   'video', 'confirmed', now() - interval '2 hours', now() - interval '90 minutes', 'America/New_York', 'Europe/London',
   'USD', '{"video": 9000}', 9000, 9000, 1000);
insert into public.payment_records (appointment_id, patient_id, purpose, provider, amount, currency, status, succeeded_at)
values ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-000000000202', 'booking', 'stripe', 9000, 'USD', 'succeeded', now());
insert into public.consultations (appointment_id, patient_joined_at)
values ('00000000-0000-4000-8000-00000000b002', now() - interval '2 hours');
select tests.login_service();
select public.sweep_appointments();
reset role;
select tests.assert((select status from public.appointments where id = '00000000-0000-4000-8000-00000000b001') = 'no_show', 'patient no-show');
select tests.assert((select status from public.appointments where id = '00000000-0000-4000-8000-00000000b002') = 'cancelled', 'doctor absence cancels');
select tests.assert((select sum(amount) from public.refunds where appointment_id = '00000000-0000-4000-8000-00000000b002') = 9000, 'and refunds in full');

-- DST consistency: every generated Rivera slot (08:00 New York, Mon/Wed/Fri) in the horizon is accepted,
-- including dates on both sides of a daylight-saving change; an hour-shifted instant is not.
do $$
declare
  v_day date;
  v_start timestamptz;
  v_checked integer := 0;
begin
  for i in 2..13 loop
    v_day := (now() at time zone 'America/New_York')::date + i;
    continue when extract(isodow from v_day)::integer not in (1, 3, 5);
    v_start := (v_day + time '08:00') at time zone 'America/New_York';
    perform tests.assert(public.assert_slot_bookable('00000000-0000-4000-8000-000000000103', v_start, 'video') = 30,
      'Rivera 08:00 NY accepted on ' || v_day);
    begin
      perform public.assert_slot_bookable('00000000-0000-4000-8000-000000000103', v_start - interval '1 hour', 'video');
      raise exception 'ASSERTION FAILED: 07:00 accepted on %', v_day;
    exception when others then
      if sqlerrm like 'ASSERTION FAILED%' then raise; end if;
    end;
    v_checked := v_checked + 1;
  end loop;
  perform tests.assert(v_checked >= 3, 'checked several dates');
end;
$$;

-- Doctor onboarding: incomplete submission lists what is missing; approval needs verified documents.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000199', 'draft.doctor@docothink.test', '{"signup_role": "doctor", "full_name": "Draft Doctor"}');
select tests.login('00000000-0000-4000-8000-000000000199');
select tests.expect_error($$select public.submit_doctor_application()$$, 'APPLICATION_INCOMPLETE');
update public.doctor_profiles set display_name = 'Draft Doctor', qualifications = 'MBBS', registration_number = 'MCI-1',
  registration_country = 'IN', fee_video = 70000, terms_accepted_at = now(), terms_version = '2026-10' where user_id = auth.uid();
select public.set_doctor_specialties(array[(select id from public.specialties where slug = 'pediatrics')],
  (select id from public.specialties where slug = 'pediatrics'));
select public.register_credential_upload('registration_certificate', 'reg.pdf', 'application/pdf', 1000);
select public.register_credential_upload('identity_document', 'id.png', 'image/png', 1000);
select tests.expect_error($$select public.register_credential_upload('other', 'x.exe', 'application/x-msdownload', 10)$$, 'INVALID_FILE_TYPE');
select public.submit_doctor_application();
select tests.expect_error($$insert into public.doctor_availability_rules (doctor_id, weekday, start_time, end_time, timezone, slot_minutes, modes)
  values ('00000000-0000-4000-8000-000000000102', 1, '09:00', '10:00', 'UTC', 15, '{video}')$$, 'row-level security');
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.expect_error($$select public.review_doctor_application('00000000-0000-4000-8000-000000000199', 'approve')$$, 'CREDENTIALS_NOT_VERIFIED');
select tests.expect_error($$select public.review_doctor_application('00000000-0000-4000-8000-000000000199', 'reject')$$, 'NOTE_REQUIRED');
select public.review_doctor_credential(id, 'verified') from public.doctor_credentials where doctor_id = '00000000-0000-4000-8000-000000000199';
select public.review_doctor_application('00000000-0000-4000-8000-000000000199', 'approve');
reset role;
select tests.login_anon();
select tests.assert(exists (select 1 from public.doctor_profiles where user_id = '00000000-0000-4000-8000-000000000199'), 'approved doctor is public');
reset role;

-- Overlapping availability windows are refused.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.expect_error($$insert into public.doctor_availability_rules (doctor_id, weekday, start_time, end_time, timezone, slot_minutes, modes)
  values (auth.uid(), 1, '11:00', '13:00', 'Europe/London', 15, '{video}')$$, 'RULE_OVERLAP');
insert into public.doctor_availability_rules (doctor_id, weekday, start_time, end_time, timezone, slot_minutes, modes)
values (auth.uid(), 6, '22:00', '24:00', 'Europe/London', 30, '{video}');
reset role;
