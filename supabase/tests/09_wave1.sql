-- Wave 1 reports: admin analytics (admins only; money only for finance) and the bank payout file
-- (finance only, audited, approved invoices only, bank details from the invoice snapshot).

insert into public.doctor_private_details (doctor_id, bank_country, account_holder_name, bank_name, account_number, ifsc, pan, kyc_status, submitted_at)
values ('00000000-0000-4000-8000-000000000101', 'IN', 'Anjali Mehta', 'SBI', '123456789012', 'SBIN0001234', 'ABCDE1234F', 'verified', now());

insert into public.appointments (id, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone, patient_timezone,
  currency, fee_snapshot, fee_amount, amount_paid, commission_bps)
values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'video', 'completed',
   now() - interval '2 days', now() - interval '2 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"video": 100000}', 100000, 100000, 1000),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'audio', 'completed',
   now() - interval '3 days', now() - interval '3 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"audio": 80000}', 80000, 80000, 1000),
  ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'chat', 'no_show',
   now() - interval '4 days', now() - interval '4 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"chat": 50000}', 50000, 50000, 1000),
  ('00000000-0000-4000-8000-00000000c004', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'chat', 'cancelled',
   now() - interval '5 days', now() - interval '5 days' + interval '20 minutes', 'Asia/Kolkata', 'America/New_York', 'INR', '{"chat": 50000}', 50000, 0, 1000);
select public.post_consultation_earning(id) from public.appointments
where id in ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002');

-- Analytics: patients are refused; admins get counts; money only with finance.manage.
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.expect_error($$select public.admin_analytics(current_date - 30, current_date, 'UTC')$$, 'FORBIDDEN');
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
create temp table a1 as select public.admin_analytics(current_date - 30, current_date, 'UTC') as j;
reset role;
select tests.assert(((select j from a1) -> 'totals' ->> 'completed')::int = 2, 'two completed consultations');
select tests.assert(((select j from a1) -> 'totals' ->> 'no_show')::int = 1, 'one no-show');
select tests.assert(((select j from a1) -> 'totals' ->> 'cancelled')::int = 1, 'one cancellation');
select tests.assert(((select j from a1) -> 'totals' ->> 'bookings')::int = 4, 'four bookings created in range');
select tests.assert((select j from a1) ? 'revenue_totals', 'finance admin sees revenue');
select tests.assert(((select j from a1) -> 'revenue_totals' -> 0 ->> 'gross')::bigint = 180000, 'gross revenue 1,800.00');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000194', 'analyst@docothink.test', '{"full_name": "Reviews Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000194';
insert into public.admin_permissions (user_id, permission) values ('00000000-0000-4000-8000-000000000194', 'doctors.manage');
select tests.login('00000000-0000-4000-8000-000000000194');
select tests.assert(not (public.admin_analytics(current_date - 30, current_date, 'UTC') ? 'revenue_totals'), 'no revenue without finance.manage');
select tests.assert(not (public.admin_analytics(current_date - 30, current_date, 'UTC') ? 'revenue_by_week'), 'no weekly revenue without finance.manage');
select tests.expect_error($$select * from public.payout_file('INR')$$, 'FORBIDDEN');
reset role;

-- Payout file: approved invoices only, snapshot bank details, net amount in major units, audited.
select tests.login('00000000-0000-4000-8000-000000000101');
create temp table inv as select * from public.submit_invoice(array['00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002']::uuid[]);
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.assert((select count(*) from public.payout_file('INR')) = 0, 'submitted (not approved) invoices are not in the file');
select public.update_payout_status((select id from inv), 'approved');
reset role;
-- The doctor changes bank details after approval: the file must still pay the invoiced account.
select tests.login('00000000-0000-4000-8000-000000000101');
select public.save_private_details('{"bank_country": "IN", "account_holder_name": "Anjali Mehta", "bank_name": "HDFC", "account_number": "999988887777", "ifsc": "HDFC0001234", "pan": "ABCDE1234F"}');
reset role;
select tests.login('00000000-0000-4000-8000-000000000001');
create temp table f as select * from public.payout_file('inr');
reset role;
select tests.assert((select count(*) from f) = 1, 'one approved INR invoice');
select tests.assert((select account_number from f) = '123456789012', 'file uses the invoice snapshot account');
select tests.assert((select routing_code from f) = 'SBIN0001234', 'IFSC from the snapshot');
select tests.assert((select amount from f) = 1458.00, 'net amount (162,000 − 16,200 TDS) in rupees');
select tests.assert((select reference from f) = (select invoice_number from inv), 'invoice number is the payment reference');
select tests.assert(exists (select 1 from public.audit_logs where action = 'payout.file_export'), 'export is audited');
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.assert((select count(*) from public.payout_file('GBP')) = 0, 'other currencies excluded');
reset role;

-- Anonymous callers can't run either report.
set role anon;
select tests.expect_error($$select public.admin_analytics(current_date - 30, current_date, 'UTC')$$, 'permission denied');
select tests.expect_error($$select * from public.payout_file('INR')$$, 'permission denied');
reset role;

-- Day and week boundaries follow the admin display zone: 02:00 UTC on 10 Jan is 21:00 on 9 Jan in New York.
insert into public.appointments (id, patient_id, doctor_id, mode, status, start_at, end_at, doctor_timezone, patient_timezone,
  currency, fee_snapshot, fee_amount, amount_paid, commission_bps, created_at)
values ('00000000-0000-4000-8000-00000000c009', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'chat', 'cancelled',
  '2026-01-12 10:00+00', '2026-01-12 10:20+00', 'Asia/Kolkata', 'America/New_York', 'INR', '{"chat": 50000}', 50000, 0, 1000, '2026-01-10 02:00+00');
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.assert((public.admin_analytics('2026-01-09', '2026-01-09', 'America/New_York') -> 'totals' ->> 'bookings')::int = 1, 'booking counted on its New York day');
select tests.assert((public.admin_analytics('2026-01-09', '2026-01-09', 'UTC') -> 'totals' ->> 'bookings')::int = 0, 'not on that UTC day');
select tests.expect_error($$select public.admin_analytics('2026-01-09', '2026-01-09', 'Mars/Olympus')$$, 'INVALID_TIMEZONE');
-- Every week in the range has a point, zero when empty (5 Jan 2026 is a Monday).
create temp table a2 as select public.admin_analytics('2026-01-01', '2026-01-31', 'America/New_York') as j;
select tests.assert(jsonb_array_length((select j from a2) -> 'bookings_by_week') = 5, 'five weeks touch January 2026');
select tests.assert(((select j from a2) -> 'bookings_by_week' -> 1 ->> 'week') = '2026-01-05', 'week of 5 Jan (New York Friday 9 Jan)');
select tests.assert(((select j from a2) -> 'bookings_by_week' -> 1 ->> 'count')::int = 1, 'booking falls in the week of 5 Jan');
select tests.assert(((select j from a2) -> 'bookings_by_week' -> 0 ->> 'count')::int = 0, 'empty weeks are zero, not missing');
reset role;
