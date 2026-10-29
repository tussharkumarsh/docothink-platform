-- Booking, double-booking protection, payment confirmation and idempotency, cancellation refunds.

-- Dr Clarke: Mon–Fri 09:00–12:00 Europe/London, 15-minute slots + 5-minute buffer.
select tests.put('slot', tests.next_slot('Europe/London', array[1, 2, 3, 4, 5], '09:20')::text);

select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('appt', (public.book_appointment(
  '00000000-0000-4000-8000-000000000102', tests.get('slot')::timestamptz, 'audio',
  'Persistent cough for two weeks', 'America/New_York')).id::text);
select tests.assert((select status from public.appointments where id = tests.get('appt')::uuid) = 'pending_payment', 'new booking awaits payment');
select tests.assert((select fee_amount from public.appointments where id = tests.get('appt')::uuid) = 3500, 'fee is the doctor''s audio fee, server-side');
select tests.assert((select currency from public.appointments where id = tests.get('appt')::uuid) = 'GBP', 'currency is the doctor''s');
select tests.assert((select commission_bps from public.appointments where id = tests.get('appt')::uuid) = 1000, '10% default commission snapshot');
select tests.assert((select end_at - start_at from public.appointments where id = tests.get('appt')::uuid) = interval '15 minutes', 'slot length from the rule');
select tests.assert((select patient_timezone || '|' || doctor_timezone from public.appointments where id = tests.get('appt')::uuid)
  = 'America/New_York|Europe/London', 'both time zones are snapshotted');
-- Direct writes are impossible.
select tests.expect_error($$update public.appointments set status = 'confirmed' where id = tests.get('appt')::uuid$$, 'permission denied');
select tests.expect_error($$insert into public.appointments (patient_id, doctor_id, mode, start_at, end_at, doctor_timezone, patient_timezone, currency, fee_snapshot, fee_amount, commission_bps)
  values (auth.uid(), '00000000-0000-4000-8000-000000000102', 'audio', now() + interval '3 days', now() + interval '3 days 15 minutes', 'UTC', 'UTC', 'GBP', '{}', 1, 0)$$, 'permission denied');
-- Off-grid, outside-hours, and unsupported-mode requests are rejected by the database.
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slot')::timestamptz + interval '5 minutes', 'audio', 'x', 'UTC')$$, 'SLOT_NOT_IN_SCHEDULE');
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000103', tests.get('slot')::timestamptz, 'chat', 'x', 'UTC')$$, 'SLOT_NOT_IN_SCHEDULE');
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000102', now() + interval '10 minutes', 'audio', 'x', 'UTC')$$, 'SLOT_TOO_SOON');
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000102', now() + interval '40 days', 'audio', 'x', 'UTC')$$, 'SLOT_BEYOND_HORIZON');
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slot')::timestamptz + interval '20 minutes', 'audio', 'x', 'Mars/Olympus')$$, 'INVALID_TIMEZONE');
-- The same patient cannot hold two overlapping appointments.
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000103', tests.get('slot')::timestamptz, 'video', 'x', 'UTC')$$, 'SLOT');
reset role;

-- Another patient cannot take the held slot.
select tests.login('00000000-0000-4000-8000-000000000202');
select tests.expect_error($$select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slot')::timestamptz, 'video', 'Rash', 'Europe/London')$$, 'SLOT_TAKEN');
select tests.assert((select count(*) from public.appointments) = 0, 'other patients cannot see the appointment');
reset role;

-- Even bypassing the RPC, the exclusion constraint forbids the overlap.
select tests.expect_error($$insert into public.appointments (patient_id, doctor_id, mode, start_at, end_at, doctor_timezone, patient_timezone, currency, fee_snapshot, fee_amount, commission_bps)
  values ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'video', tests.get('slot')::timestamptz + interval '5 minutes', tests.get('slot')::timestamptz + interval '20 minutes', 'UTC', 'UTC', 'GBP', '{}', 1, 0)$$,
  'appointments_doctor_no_overlap');

-- Doctor has no clinical access before the booking is paid.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.assert((select count(*) from public.patient_medical_profiles) = 0, 'no clinical access while pending payment');
select tests.assert((select count(*) from public.appointment_intakes) = 1, 'doctor sees the intake for their own appointment');
reset role;

-- Payment: amount decided by the database.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('pay', (public.create_payment_record(tests.get('appt')::uuid, 'booking')).id::text);
select tests.assert((select amount from public.payment_records where id = tests.get('pay')::uuid) = 3500, 'payment amount computed server-side');
select tests.expect_error($$select public.create_payment_record(tests.get('appt')::uuid, 'upgrade', 'video')$$, 'UPGRADE_NOT_ALLOWED');
reset role;
select tests.login('00000000-0000-4000-8000-000000000202');
select tests.expect_error($$select public.create_payment_record(tests.get('appt')::uuid, 'booking')$$, 'FORBIDDEN');
reset role;

-- Webhook (service role): mismatched amount is refused, correct one confirms once.
select tests.login_service();
select tests.assert(public.confirm_payment(tests.get('pay')::uuid, 'pi_1', 3500, 'gbp') = 'confirmed', 'payment confirms the booking');
select tests.assert(public.confirm_payment(tests.get('pay')::uuid, 'pi_1', 3500, 'gbp') = 'already_processed', 'duplicate webhook is a no-op');
reset role;
select tests.assert((select status from public.appointments where id = tests.get('appt')::uuid) = 'confirmed', 'appointment confirmed');
select tests.assert((select amount_paid from public.appointments where id = tests.get('appt')::uuid) = 3500, 'amount paid recorded once');
select tests.assert((select count(*) from public.email_outbox where template = 'appointment_confirmed') = 2, 'confirmation email queued for patient and doctor, once');
select tests.assert((select payload ->> 'recipient_timezone' from public.email_outbox where template = 'appointment_confirmed' and to_user_id = '00000000-0000-4000-8000-000000000201')
  = 'America/New_York', 'patient email carries the patient time zone');

-- Now the doctor has a treating relationship.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.assert((select count(*) from public.patient_medical_profiles) = 1, 'treating doctor can read the medical profile');
select tests.assert((select count(*) from public.payment_records) = 0, 'doctors do not see patient payments');
reset role;

-- Upgrade audio → video: price difference from the booking-time snapshot (4500 - 3500).
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('upg', (public.create_payment_record(tests.get('appt')::uuid, 'upgrade', 'video')).id::text);
select tests.assert((select amount from public.payment_records where id = tests.get('upg')::uuid) = 1000, 'upgrade charges the difference');
select tests.expect_error($$select public.create_payment_record(tests.get('appt')::uuid, 'upgrade', 'chat')$$, 'UPGRADE_NOT_PRICED');
reset role;
select tests.login_service();
select tests.assert(public.confirm_payment(tests.get('upg')::uuid, 'pi_2', 999, 'GBP') = 'amount_mismatch', 'underpayment is rejected');
reset role;
select tests.assert((select mode from public.appointments where id = tests.get('appt')::uuid) = 'audio', 'mode unchanged after a bad payment');
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.put('upg', (public.create_payment_record(tests.get('appt')::uuid, 'upgrade', 'video')).id::text);
reset role;
select tests.login_service();
select tests.assert(public.confirm_payment(tests.get('upg')::uuid, 'pi_3', 1000, 'GBP') = 'upgraded', 'upgrade applied after payment');
reset role;
select tests.assert((select mode::text || ':' || fee_amount || ':' || amount_paid from public.appointments where id = tests.get('appt')::uuid)
  = 'video:4500:4500', 'upgrade updates mode, fee and amount paid');
select tests.assert((select count(*) from public.appointment_events where appointment_id = tests.get('appt')::uuid and event = 'mode_changed') = 1,
  'upgrade recorded in history');

-- Patient cancels more than 24h ahead: full refund queued per policy.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.assert((public.cancel_appointment(tests.get('appt')::uuid, 'Feeling better') ->> 'refund_amount')::bigint = 4500,
  'full refund when cancelling early');
select tests.expect_error($$select public.cancel_appointment(tests.get('appt')::uuid, 'again')$$, 'CANNOT_CANCEL');
reset role;
select tests.assert((select coalesce(sum(amount), 0) from public.refunds where appointment_id = tests.get('appt')::uuid) = 4500,
  'refunds allocated across both payments');
select tests.assert((select count(*) from public.refunds where appointment_id = tests.get('appt')::uuid) = 2, 'one refund per payment');

-- Provider confirms refunds → appointment becomes refunded.
select tests.login_service();
select public.complete_refund(id, true, 're_' || id::text) from public.refunds where appointment_id = tests.get('appt')::uuid;
select public.complete_refund(id, true, 're_again') from public.refunds where appointment_id = tests.get('appt')::uuid;
reset role;
select tests.assert((select status from public.appointments where id = tests.get('appt')::uuid) = 'refunded', 'fully refunded appointment');
select tests.assert(not exists (select 1 from public.financial_ledger_entries), 'no doctor earning for a refunded, never-completed consultation');

-- The slot is free again.
select tests.login('00000000-0000-4000-8000-000000000202');
select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slot')::timestamptz, 'video', 'Rash', 'Europe/London');
reset role;

-- Expired holds release the slot.
update public.appointments set payment_expires_at = now() - interval '1 minute' where patient_id = '00000000-0000-4000-8000-000000000202';
select tests.login('00000000-0000-4000-8000-000000000201');
select public.book_appointment('00000000-0000-4000-8000-000000000102', tests.get('slot')::timestamptz, 'chat', 'Follow-up', 'America/New_York');
reset role;
select tests.assert((select status from public.appointments where patient_id = '00000000-0000-4000-8000-000000000202') = 'expired', 'stale hold expired');
