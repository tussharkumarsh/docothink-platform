-- Settlement invoices: KYC gate, ownership, no double payment (incl. against batches), TDS, withdraw/reject
-- release, paid needs a reference and hits the ledger, bank snapshot is frozen, late refunds stay invoiceable.

-- Fixtures (as postgres): verified bank details and completed, credited appointments.
insert into public.doctor_private_details (doctor_id, bank_country, account_holder_name, bank_name, account_number, ifsc, pan, kyc_status, submitted_at)
values ('00000000-0000-4000-8000-000000000101', 'IN', 'Anjali Mehta', 'SBI', '123456789012', 'SBIN0001234', 'ABCDE1234F', 'verified', now()),
       ('00000000-0000-4000-8000-000000000102', 'GB', 'James Clarke', 'Barclays', '12345678', null, null, 'verified', now());
update public.doctor_private_details set sort_code = '123456' where doctor_id = '00000000-0000-4000-8000-000000000102';

insert into public.appointments (id, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone, patient_timezone,
  currency, fee_snapshot, fee_amount, amount_paid, commission_bps)
values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'video', 'completed',
   now() - interval '10 days', now() - interval '10 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"video": 100000}', 100000, 100000, 1000),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'audio', 'completed',
   now() - interval '9 days', now() - interval '9 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"audio": 80000}', 80000, 80000, 1000),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'chat', 'completed',
   now() - interval '8 days', now() - interval '8 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"chat": 50000}', 50000, 50000, 1000),
  ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'chat', 'confirmed',
   now() + interval '8 days', now() + interval '8 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"chat": 50000}', 50000, 50000, 1000),
  ('00000000-0000-4000-8000-00000000b005', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'video', 'completed',
   now() - interval '7 days', now() - interval '7 days' + interval '20 minutes', 'Europe/London', 'Europe/London', 'GBP', '{"video": 4500}', 4500, 4500, 1000);
insert into public.payment_records (appointment_id, patient_id, purpose, provider, provider_payment_id, amount, currency, status, succeeded_at)
values ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-000000000201', 'booking', 'manual', 'test_b002', 80000, 'INR', 'succeeded', now() - interval '9 days');
select public.post_consultation_earning(id) from public.appointments
where id in ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000b005');

-- Mehta (IN) invoices two consultations: 90,000 + 72,000 = 162,000 gross, TDS 16,200, net 145,800.
select tests.login('00000000-0000-4000-8000-000000000101');
select tests.assert((select count(*) from public.invoiceable_entries()) = 3, 'three earnings are invoiceable');
create temp table inv1 as select * from public.submit_invoice(array['00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000b002']::uuid[]);
select tests.assert((select source from inv1) = 'invoice' and (select invoice_number from inv1) like 'INV-____-______', 'invoice numbered');
select tests.assert((select gross_amount from inv1) = 162000 and (select tds_amount from inv1) = 16200 and (select amount from inv1) = 145800,
  'IN invoice withholds 10% TDS');
select tests.assert((select bank_snapshot ->> 'pan' from inv1) = 'ABCDE1234F', 'bank details snapshotted');
select tests.expect_error($$select public.submit_invoice(array['00000000-0000-4000-8000-00000000b001']::uuid[])$$, 'ENTRY_NOT_INVOICEABLE');
select tests.expect_error($$select public.submit_invoice(array['00000000-0000-4000-8000-00000000b004']::uuid[])$$, 'ENTRY_NOT_INVOICEABLE');
select tests.expect_error($$select public.submit_invoice('{}'::uuid[])$$, 'NOTHING_SELECTED');
reset role;
select tests.assert((select count(*) from public.payout_items where payout_id = (select id from inv1)) = 2, 'two ledger entries on the invoice');

-- Clarke (GB): no TDS; can't invoice Mehta's consultations; KYC must be verified.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.expect_error($$select public.submit_invoice(array['00000000-0000-4000-8000-00000000b003']::uuid[])$$, 'ENTRY_NOT_INVOICEABLE');
select tests.assert((select count(*) from public.doctor_payouts) = 0, 'Clarke cannot see Mehta''s invoice');
reset role;
update public.doctor_private_details set kyc_status = 'pending' where doctor_id = '00000000-0000-4000-8000-000000000102';
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.expect_error($$select public.submit_invoice(array['00000000-0000-4000-8000-00000000b005']::uuid[])$$, 'KYC_NOT_VERIFIED');
reset role;
update public.doctor_private_details set kyc_status = 'verified' where doctor_id = '00000000-0000-4000-8000-000000000102';
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.assert((select tds_amount from public.submit_invoice(array['00000000-0000-4000-8000-00000000b005']::uuid[])) = 0, 'no TDS outside India');
reset role;

-- Bank snapshot is frozen: later bank changes don't rewrite the invoice.
select tests.login('00000000-0000-4000-8000-000000000101');
select public.save_private_details('{"bank_country": "IN", "account_holder_name": "Anjali Mehta", "bank_name": "HDFC", "account_number": "999988887777", "ifsc": "HDFC0001234", "pan": "ABCDE1234F"}');
reset role;
select tests.assert((select bank_snapshot ->> 'account_number' from public.doctor_payouts where id = (select id from inv1)) = '123456789012',
  'invoice keeps the account it was raised with');
update public.doctor_private_details set kyc_status = 'verified' where doctor_id = '00000000-0000-4000-8000-000000000101';

-- A date batch never picks up invoiced entries.
select tests.login('00000000-0000-4000-8000-000000000001');
select public.create_settlement_batch(current_date, 'INR', now());
reset role;
select tests.assert((select count(*) from public.payout_items pi join public.doctor_payouts p on p.id = pi.payout_id
  where p.source = 'batch' and p.doctor_id = '00000000-0000-4000-8000-000000000101') = 1, 'batch only took the un-invoiced consultation');

-- Withdraw: owner only, pending only; releases the consultations.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.expect_error(format('select public.withdraw_invoice(%L)', (select id from inv1)), 'FORBIDDEN');
reset role;
select tests.login('00000000-0000-4000-8000-000000000101');
select public.withdraw_invoice((select id from inv1));
select tests.assert((select status::text from public.doctor_payouts where id = (select id from inv1)) = 'cancelled', 'withdrawn');
select tests.assert(exists (select 1 from public.invoiceable_entries() where appointment_id = '00000000-0000-4000-8000-00000000b001'), 'released after withdraw');
select tests.expect_error(format('select public.withdraw_invoice(%L)', (select id from inv1)), 'NOT_PENDING');
create temp table inv2 as select * from public.submit_invoice(array['00000000-0000-4000-8000-00000000b001']::uuid[]);
create temp table inv3 as select * from public.submit_invoice(array['00000000-0000-4000-8000-00000000b002']::uuid[]);
reset role;

-- Reject after approve releases the consultation; a doctors-only admin can't reject.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000195', 'onboarding@docothink.test', '{"full_name": "Onboarding Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000195';
insert into public.admin_permissions (user_id, permission) values ('00000000-0000-4000-8000-000000000195', 'doctors.manage');
select tests.login('00000000-0000-4000-8000-000000000195');
select tests.expect_error(format('select public.reject_invoice(%L, %L)', (select id from inv2), 'no'), 'FORBIDDEN');
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
select public.update_payout_status((select id from inv2), 'approved');
select tests.expect_error(format('select public.reject_invoice(%L, %L)', (select id from inv2), '  '), 'NOTE_REQUIRED');
select public.reject_invoice((select id from inv2), 'Bank transfer bounced');
reset role;
select tests.assert((select status::text from public.doctor_payouts where id = (select id from inv2)) = 'failed', 'rejected');
select tests.login('00000000-0000-4000-8000-000000000101');
select tests.assert(exists (select 1 from public.invoiceable_entries() where appointment_id = '00000000-0000-4000-8000-00000000b001'), 'released after reject');
reset role;

-- Paid needs a reference and records the net payout in the ledger.
select tests.login('00000000-0000-4000-8000-000000000001');
select public.update_payout_status((select id from inv3), 'approved');
select tests.expect_error(format('select public.update_payout_status(%L, %L)', (select id from inv3), 'paid'), 'TRANSACTION_REFERENCE_REQUIRED');
select public.update_payout_status((select id from inv3), 'paid', 'UTR123', 'NEFT');
reset role;
select tests.assert((select amount from public.financial_ledger_entries where payout_id = (select id from inv3) and entry_type = 'payout') = -64800,
  'ledger records the net payout (72,000 − 7,200 TDS)');

-- A refund after payment creates a reversal that stays invoiceable on a later invoice.
select public.create_refunds('00000000-0000-4000-8000-00000000b002', 20000, 'Goodwill refund', null);
select public.complete_refund(id, true, 'test_refund', null) from public.refunds where appointment_id = '00000000-0000-4000-8000-00000000b002';
select tests.login('00000000-0000-4000-8000-000000000101');
select tests.assert(exists (select 1 from public.invoiceable_entries() where appointment_id = '00000000-0000-4000-8000-00000000b002' and entry_type = 'refund_reversal'),
  'late refund reversal is invoiceable');
reset role;
