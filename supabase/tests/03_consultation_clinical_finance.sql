-- Consultation lifecycle, chat security, prescriptions (immutability, amendments),
-- earnings ledger, refunds after completion, settlements and payouts.

-- A confirmed, paid appointment starting in 5 minutes (inserted directly to control time).
insert into public.appointments (id, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone,
  patient_timezone, currency, fee_snapshot, fee_amount, amount_paid, commission_bps)
values ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101', 'video', 'confirmed', now() + interval '5 minutes',
  now() + interval '25 minutes', 'Asia/Kolkata', 'America/New_York', 'INR',
  '{"chat": 50000, "audio": 80000, "video": 100000}', 100000, 100000, 1000);
insert into public.payment_records (appointment_id, patient_id, purpose, provider, amount, currency, status, succeeded_at)
values ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000201', 'booking', 'stripe',
  100000, 'INR', 'succeeded', now());

-- Strangers cannot join, read or post; realtime signalling channel is restricted too.
select tests.login('00000000-0000-4000-8000-000000000202');
select tests.expect_error($$select public.join_consultation('00000000-0000-4000-8000-00000000a001')$$, 'FORBIDDEN');
select tests.expect_error($$insert into public.consultation_messages (appointment_id, sender_id, client_id, body)
  values ('00000000-0000-4000-8000-00000000a001', auth.uid(), gen_random_uuid(), 'hi')$$, 'row-level security');
select set_config('realtime.topic', 'consult:00000000-0000-4000-8000-00000000a001', true);
select tests.expect_error($$insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{}')$$, 'row-level security');
select tests.assert((select count(*) from realtime.messages) = 0, 'stranger receives nothing');
reset role;

-- Patient joins first (status stays confirmed), then the doctor starts the consultation.
select tests.login('00000000-0000-4000-8000-000000000201');
select public.join_consultation('00000000-0000-4000-8000-00000000a001');
insert into public.consultation_messages (appointment_id, sender_id, client_id, body)
values ('00000000-0000-4000-8000-00000000a001', auth.uid(), '00000000-0000-4000-8000-0000000c0001', 'Hello doctor');
-- Retried send with the same client_id is rejected (no duplicates).
select tests.expect_error($$insert into public.consultation_messages (appointment_id, sender_id, client_id, body)
  values ('00000000-0000-4000-8000-00000000a001', auth.uid(), '00000000-0000-4000-8000-0000000c0001', 'Hello doctor')$$, 'duplicate key');
-- Cannot impersonate the doctor.
select tests.expect_error($$insert into public.consultation_messages (appointment_id, sender_id, client_id, body)
  values ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-000000000101', gen_random_uuid(), 'fake')$$, 'row-level security');
select set_config('realtime.topic', 'consult:00000000-0000-4000-8000-00000000a001', true);
insert into realtime.messages (topic, extension, payload) values (realtime.topic(), 'broadcast', '{"type": "offer"}');
select tests.expect_error($$select public.complete_consultation('00000000-0000-4000-8000-00000000a001')$$, 'FORBIDDEN');
reset role;
select tests.assert((select status from public.appointments where id = '00000000-0000-4000-8000-00000000a001') = 'confirmed',
  'patient joining alone does not start the consultation');

select tests.login('00000000-0000-4000-8000-000000000101');
select public.join_consultation('00000000-0000-4000-8000-00000000a001');
select tests.assert((select status from public.appointments where id = '00000000-0000-4000-8000-00000000a001') = 'in_progress',
  'doctor joining starts the consultation');
select public.mark_messages_read('00000000-0000-4000-8000-00000000a001');
select tests.assert((select read_at is not null from public.consultation_messages where body = 'Hello doctor'), 'read receipt recorded');
select tests.assert((select count(*) from public.patient_medical_profiles) = 1, 'doctor sees the patient record during consultation');

-- Prescription draft → items → finalise.
select tests.put('rx', (public.create_prescription_draft('00000000-0000-4000-8000-00000000a001')).id::text);
update public.prescriptions set presenting_symptoms = 'Itchy rash on forearms', diagnosis = 'Contact dermatitis',
  treatment_plan = 'Topical steroid, avoid irritant' where id = tests.get('rx')::uuid;
insert into public.prescription_items (prescription_id, position, medication_name, strength, dosage_form, dose, route, frequency, duration, instructions)
values (tests.get('rx')::uuid, 1, 'Hydrocortisone cream', '1%', 'Cream', 'Thin layer', 'Topical', 'Twice daily', '7 days', 'Apply to affected area');
-- Doctors cannot forge status/hash columns directly.
select tests.expect_error($$update public.prescriptions set status = 'final' where id = tests.get('rx')::uuid$$, 'permission denied');
reset role;

-- Patient cannot see the draft.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.assert((select count(*) from public.prescriptions) = 0, 'drafts are private to the doctor');
reset role;

select tests.login('00000000-0000-4000-8000-000000000101');
select public.finalize_prescription(tests.get('rx')::uuid);
select tests.assert((select status from public.prescriptions where id = tests.get('rx')::uuid) = 'final', 'prescription finalised');
select tests.assert((select length(content_hash) = 64 from public.prescriptions where id = tests.get('rx')::uuid), 'content hash recorded');
-- Finalised documents are immutable.
update public.prescriptions set diagnosis = 'Changed' where id = tests.get('rx')::uuid;
select tests.assert((select diagnosis from public.prescriptions where id = tests.get('rx')::uuid) = 'Contact dermatitis', 'final cannot be edited');
select tests.expect_error($$insert into public.prescription_items (prescription_id, medication_name) values (tests.get('rx')::uuid, 'Extra')$$, 'IMMUTABLE');
-- Amend: new version with reason; finalising it supersedes v1.
select tests.put('rx2', (public.amend_prescription(tests.get('rx')::uuid, 'Added antihistamine')).id::text);
insert into public.prescription_items (prescription_id, position, medication_name, strength, dosage_form, dose, route, frequency, duration)
values (tests.get('rx2')::uuid, 2, 'Cetirizine', '10 mg', 'Tablet', '1 tablet', 'Oral', 'Once daily at night', '7 days');
select public.finalize_prescription(tests.get('rx2')::uuid);
select tests.assert((select status from public.prescriptions where id = tests.get('rx')::uuid) = 'superseded', 'v1 superseded');
select tests.assert((select count(*) from public.prescription_items where prescription_id = tests.get('rx2')::uuid) = 2, 'v2 carries items forward');

-- Complete: earning = 100000 gross - 10% = 90000 net.
select public.complete_consultation('00000000-0000-4000-8000-00000000a001');
select tests.assert((select status from public.appointments where id = '00000000-0000-4000-8000-00000000a001') = 'completed', 'completed');
select tests.assert((select amount::text || '/' || commission_amount || '/' || gross_amount from public.financial_ledger_entries
  where entry_type = 'consultation_earning') = '90000/10000/100000', 'earning net of 10% commission');
select tests.expect_error($$select public.complete_consultation('00000000-0000-4000-8000-00000000a001')$$, 'CONSULTATION_NOT_IN_PROGRESS');
reset role;

select tests.login('00000000-0000-4000-8000-000000000201');
select tests.assert((select count(*) from public.prescriptions) = 2, 'patient sees final and superseded versions');
select tests.expect_error($$insert into public.consultation_messages (appointment_id, sender_id, client_id, body)
  values ('00000000-0000-4000-8000-00000000a001', auth.uid(), gen_random_uuid(), 'late')$$, 'row-level security');
reset role;

-- Ledger is append-only.
select tests.expect_error($$update public.financial_ledger_entries set amount = 1$$, 'IMMUTABLE');
select tests.expect_error($$delete from public.financial_ledger_entries$$, 'IMMUTABLE');

-- Partial refund after completion reverses the doctor's share: 20000 refund → -18000.
select tests.login('00000000-0000-4000-8000-000000000001');
select public.admin_refund('00000000-0000-4000-8000-00000000a001', 20000, 'Service recovery');
select tests.expect_error($$select public.admin_refund('00000000-0000-4000-8000-00000000a001', 90000, 'too much')$$, 'INVALID_AMOUNT');
reset role;
select tests.login_service();
select public.complete_refund(id, true, 're_partial') from public.refunds where appointment_id = '00000000-0000-4000-8000-00000000a001';
reset role;
select tests.assert((select amount from public.financial_ledger_entries where entry_type = 'refund_reversal') = -18000, 'reversal of doctor share');
select tests.assert((select status from public.appointments where id = '00000000-0000-4000-8000-00000000a001') = 'completed',
  'partial refund keeps the appointment completed');

-- Settlement: payable = 90000 - 18000 = 72000. Idempotent per date and currency.
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.put('batch', public.create_settlement_batch(current_date, 'INR', now())::text);
select tests.assert(public.create_settlement_batch(current_date, 'INR', now())::text = tests.get('batch'), 'same batch on retry');
select tests.assert((select count(*) from public.doctor_payouts) = 1, 'one payout for the doctor');
select tests.assert((select amount from public.doctor_payouts) = 72000, 'payout amount = net earnings minus reversals');
select tests.put('payout', (select id::text from public.doctor_payouts));
select tests.expect_error($$select public.update_payout_status(tests.get('payout')::uuid, 'paid', 'REF-1')$$, 'INVALID_TRANSITION');
select public.update_payout_status(tests.get('payout')::uuid, 'approved');
select tests.expect_error($$select public.update_payout_status(tests.get('payout')::uuid, 'paid')$$, 'TRANSACTION_REFERENCE_REQUIRED');
select public.update_payout_status(tests.get('payout')::uuid, 'paid', 'NEFT-2026-000123', 'Bank transfer');
select tests.expect_error($$select public.update_payout_status(tests.get('payout')::uuid, 'pending')$$, 'INVALID_TRANSITION');
-- A new batch the next day finds nothing left to pay.
select public.create_settlement_batch(current_date + 1, 'INR', now());
select tests.assert((select count(*) from public.doctor_payouts) = 1, 'no duplicate payout');
reset role;
select tests.assert((select sum(amount) from public.financial_ledger_entries where doctor_id = '00000000-0000-4000-8000-000000000101') = 0,
  'doctor balance is zero after payout');

select tests.login('00000000-0000-4000-8000-000000000101');
select tests.assert((select count(*) from public.doctor_payouts) = 1, 'doctor sees own payout');
select tests.assert((select count(*) from public.payout_batches) = 0, 'doctor cannot see batches');
select tests.expect_error($$select public.create_settlement_batch(current_date + 2, 'INR', now())$$, 'FORBIDDEN');
reset role;
