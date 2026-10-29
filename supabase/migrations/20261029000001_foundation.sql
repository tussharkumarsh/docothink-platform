-- Foundation: extensions, enums, generic helpers.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('patient', 'doctor', 'admin');
create type public.consultation_mode as enum ('chat', 'audio', 'video');
create type public.doctor_application_status as enum (
  'draft', 'submitted', 'under_review', 'info_required', 'approved', 'rejected', 'suspended'
);
-- "Change requested" and "rescheduled" are derived (open change request / reschedule_count),
-- so the confirmed slot stays protected while a request is pending. See docs/02-architecture.md.
create type public.appointment_status as enum (
  'pending_payment', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'refunded', 'expired'
);
create type public.change_request_status as enum ('pending', 'approved', 'rejected', 'withdrawn');
create type public.payment_status as enum (
  'pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'
);
create type public.refund_status as enum ('pending', 'succeeded', 'failed');
create type public.payout_status as enum (
  'pending', 'under_review', 'approved', 'processing', 'paid', 'failed', 'on_hold'
);
create type public.ledger_entry_type as enum (
  'consultation_earning', 'refund_reversal', 'adjustment', 'payout'
);
create type public.prescription_status as enum ('draft', 'final', 'superseded');
create type public.credential_kind as enum (
  'medical_degree', 'registration_certificate', 'identity_document', 'other'
);
create type public.verification_status as enum ('pending', 'verified', 'rejected');
create type public.document_category as enum (
  'lab_report', 'imaging', 'prescription', 'discharge_summary', 'other'
);
create type public.outbox_status as enum ('pending', 'sending', 'sent', 'failed');

-- IANA zone names only (e.g. 'Asia/Kolkata'); abbreviations such as 'IST' are ambiguous and rejected.
create function public.is_valid_timezone(tz text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if tz is null or tz = '' then
    return false;
  end if;
  return exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
end;
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Minutes since local midnight for a time value; '24:00' maps to 1440.
create function public.minutes_of_day(t time)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (extract(hour from t) * 60 + extract(minute from t))::integer
$$;

create function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE: % rows cannot be modified or deleted', tg_table_name
    using errcode = 'P0001';
end;
$$;
