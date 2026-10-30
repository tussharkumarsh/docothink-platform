-- ============================================================================
-- Removes everything created by supabase/demo/seed-demo.sql: all is_demo accounts and every
-- appointment, payment, refund, earning, prescription and review attached to them.
--
--   npx supabase db query --linked -f supabase/demo/cleanup-demo.sql
--
-- Stops without deleting anything if a real (non-demo) account has an appointment with a demo
-- account, and lists those appointments so they can be handled by hand.
-- ============================================================================

begin;

-- Hold off new bookings until commit, so nothing can link real and demo accounts after the check below.
lock table public.appointments in share row exclusive mode;

do $$
declare
  v_refs text;
begin
  select string_agg(a.reference, ', ' order by a.reference) into v_refs
  from public.appointments a
  join public.profiles pp on pp.id = a.patient_id
  join public.profiles pd on pd.id = a.doctor_id
  where pp.is_demo <> pd.is_demo;
  if v_refs is not null then
    raise exception 'REAL_DATA_LINKED: real accounts have appointments with demo accounts: %', v_refs;
  end if;
end;
$$;

create temp table demo_ids on commit drop as select id from public.profiles where is_demo;

-- Prescriptions, ledger, commission rules and audit logs are immutable by design; lift those guards only
-- for this transaction (tables are locked meanwhile, so no real write can slip through unguarded).
alter table public.prescriptions disable trigger prescriptions_immutability;
alter table public.prescription_items disable trigger prescription_items_guard;
alter table public.financial_ledger_entries disable trigger ledger_immutable;
alter table public.commission_rules disable trigger commission_rules_immutable;
alter table public.audit_logs disable trigger audit_logs_immutable;

-- Ledger payout entries reference their payout, so: items, then ledger, then payouts (incl. invoices).
delete from public.payout_items where ledger_entry_id in
  (select id from public.financial_ledger_entries where doctor_id in (select id from demo_ids))
  or payout_id in (select id from public.doctor_payouts where doctor_id in (select id from demo_ids));
delete from public.financial_ledger_entries where doctor_id in (select id from demo_ids);
delete from public.doctor_payouts where doctor_id in (select id from demo_ids);
delete from public.refunds where appointment_id in (select id from public.appointments where doctor_id in (select id from demo_ids));
delete from public.payment_records where appointment_id in (select id from public.appointments where doctor_id in (select id from demo_ids));
delete from public.prescriptions where doctor_id in (select id from demo_ids);
-- Cascades to reviews, intakes, events, change requests, consultations and messages.
delete from public.appointments where doctor_id in (select id from demo_ids);
delete from public.email_outbox where to_user_id in (select id from demo_ids) or to_email like '%@demo.docothink.test';
-- Rows that point at a demo account without a cascade (actor/uploader/granter columns).
delete from public.doctor_application_events where doctor_id in (select id from demo_ids) or actor_id in (select id from demo_ids);
delete from public.doctor_fee_history where doctor_id in (select id from demo_ids);
delete from public.clinical_access_grants where patient_id in (select id from demo_ids) or doctor_id in (select id from demo_ids);
delete from public.medical_documents where patient_id in (select id from demo_ids);

-- Cascades to profiles, patient/doctor profiles, availability, specialties links, notifications, identities.
delete from auth.users where id in (select id from demo_ids);
delete from public.platform_settings where key = 'demo';

alter table public.prescriptions enable trigger prescriptions_immutability;
alter table public.prescription_items enable trigger prescription_items_guard;
alter table public.financial_ledger_entries enable trigger ledger_immutable;
alter table public.commission_rules enable trigger commission_rules_immutable;
alter table public.audit_logs enable trigger audit_logs_immutable;

commit;

select (select count(*) from public.profiles where is_demo) as demo_accounts_left;
