-- Demo data must never touch real patients or real inboxes: no real-patient bookings with demo doctors,
-- and nothing queued to demo accounts or the reserved demo domain.

update public.profiles set is_demo = true where id in ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000202');
update public.doctor_profiles set is_demo = true where user_id = '00000000-0000-4000-8000-000000000103';

-- A real patient (Emily) can't hold an appointment with a demo doctor (Rivera) …
select tests.expect_error($$
  insert into public.appointments (patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone, patient_timezone,
    currency, fee_snapshot, fee_amount, commission_bps)
  values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 'video', 'pending_payment',
    now() + interval '3 days', now() + interval '3 days 30 minutes', 'America/New_York', 'America/New_York',
    'USD', '{"video": 9000}', 9000, 1000)
$$, 'DEMO_DOCTOR_NOT_BOOKABLE');

-- … but a demo patient (Oliver, flagged above) can, so demos still show the booking flow.
insert into public.appointments (patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone, patient_timezone,
  currency, fee_snapshot, fee_amount, commission_bps)
values ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000103', 'video', 'pending_payment',
  now() + interval '3 days', now() + interval '3 days 30 minutes', 'America/New_York', 'Europe/London',
  'USD', '{"video": 9000}', 9000, 1000);
select tests.assert(exists (select 1 from public.appointments where patient_id = '00000000-0000-4000-8000-000000000202'
  and doctor_id = '00000000-0000-4000-8000-000000000103'), 'demo patient can book a demo doctor');

-- Email to demo accounts or the demo domain is silently dropped; real recipients still queue.
insert into public.email_outbox (dedupe_key, to_user_id, to_email, template)
values ('t-demo-user', '00000000-0000-4000-8000-000000000202', 'oliver@docothink.test', 'appointment_reminder'),
       ('t-demo-domain', null, 'someone@demo.docothink.test', 'appointment_reminder'),
       ('t-real', '00000000-0000-4000-8000-000000000201', 'emily@docothink.test', 'appointment_reminder');
select tests.assert(not exists (select 1 from public.email_outbox where dedupe_key in ('t-demo-user', 't-demo-domain')),
  'no email is queued for demo recipients');
select tests.assert(exists (select 1 from public.email_outbox where dedupe_key = 't-real'), 'real recipients still get email');
