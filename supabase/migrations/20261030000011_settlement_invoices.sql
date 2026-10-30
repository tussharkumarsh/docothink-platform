-- Doctor-raised settlement invoices on the existing payout ledger: a doctor_payouts row with
-- source = 'invoice' whose payout_items are the selected ledger entries (payout_items.ledger_entry_id is
-- unique, so a consultation can never be in two payouts, invoice or batch). TDS is withheld for the
-- countries in platform_settings 'tds'. Approve / paid reuse update_payout_status().

alter type public.payout_status add value if not exists 'cancelled';

alter table public.doctor_payouts
  alter column batch_id drop not null,
  add column source text not null default 'batch' check (source in ('batch', 'invoice')),
  add column invoice_number text unique,
  add column gross_amount bigint,
  add column tds_rate_bps integer not null default 0 check (tds_rate_bps between 0 and 10000),
  add column tds_amount bigint not null default 0 check (tds_amount >= 0),
  add column bank_snapshot jsonb,
  add column rejection_reason text check (char_length(rejection_reason) <= 1000),
  add column submitted_at timestamptz,
  add constraint doctor_payouts_source_batch check ((source = 'batch') = (batch_id is not null));

create sequence public.invoice_number_seq;

insert into public.platform_settings (key, value) values
  ('tds', '{"rate_bps": 1000, "countries": ["IN"]}'),
  ('billing', '{"company_name": "", "address": "", "gstin": "", "pan": "", "email": ""}')
on conflict (key) do nothing;

-- The caller's ledger entries (earnings and refund reversals) that are in no payout yet.
create function public.invoiceable_entries()
returns table (
  ledger_entry_id bigint, appointment_id uuid, reference text, start_at timestamptz, mode public.consultation_mode,
  patient_initials text, currency text, amount bigint, gross_amount bigint, commission_amount bigint,
  entry_type public.ledger_entry_type
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'doctor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select l.id, l.appointment_id, a.reference, a.start_at, a.mode,
         case when position(' ' in trim(coalesce(p.full_name, ''))) = 0 then upper(left(coalesce(nullif(trim(p.full_name), ''), 'P'), 1)) || '.'
              else upper(left(trim(p.full_name), 1)) || '. ' || upper(left(regexp_replace(trim(p.full_name), '^.*\s+', ''), 1)) || '.' end,
         l.currency::text, l.amount, l.gross_amount, l.commission_amount, l.entry_type
  from public.financial_ledger_entries l
  join public.appointments a on a.id = l.appointment_id
  join public.profiles p on p.id = a.patient_id
  where l.doctor_id = auth.uid()
    and l.entry_type in ('consultation_earning', 'refund_reversal')
    and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id)
  order by a.start_at desc, l.id;
end;
$$;

create function public.submit_invoice(p_appointments uuid[])
returns public.doctor_payouts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kyc public.doctor_private_details;
  v_tds jsonb := coalesce(public.setting('tds'), '{}'::jsonb);
  v_currencies integer;
  v_currency text;
  v_gross bigint;
  v_rate integer := 0;
  v_tds_amount bigint;
  v_payout public.doctor_payouts;
begin
  if public.current_app_role() is distinct from 'doctor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_kyc from public.doctor_private_details where doctor_id = auth.uid();
  if not found or v_kyc.kyc_status <> 'verified' then
    raise exception 'KYC_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if coalesce(cardinality(p_appointments), 0) = 0 then
    raise exception 'NOTHING_SELECTED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('invoice:' || auth.uid()::text, 0));

  -- Every selected appointment: the caller's, finished, and with at least one unsettled entry.
  if exists (
    select 1 from unnest(p_appointments) s(id)
    where not exists (
      select 1 from public.appointments a
      join public.financial_ledger_entries l on l.appointment_id = a.id
        and l.entry_type in ('consultation_earning', 'refund_reversal')
        and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id)
      where a.id = s.id and a.doctor_id = auth.uid() and a.status in ('completed', 'refunded')
    )
  ) then
    raise exception 'ENTRY_NOT_INVOICEABLE' using errcode = 'P0001';
  end if;

  create temp table if not exists invoice_entries (id bigint, amount bigint, currency text) on commit drop;
  delete from invoice_entries;
  insert into invoice_entries
  select l.id, l.amount, l.currency::text from public.financial_ledger_entries l
  where l.doctor_id = auth.uid() and l.appointment_id = any (p_appointments)
    and l.entry_type in ('consultation_earning', 'refund_reversal')
    and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id);

  select count(distinct currency), min(currency) into v_currencies, v_currency from invoice_entries;
  if v_currencies > 1 then
    raise exception 'MIXED_CURRENCY' using errcode = 'P0001';
  end if;
  -- Deductions can't be left out: every unsettled refund reversal or adjustment in this currency is
  -- netted into the invoice, whether or not its appointment was selected.
  insert into invoice_entries
  select l.id, l.amount, l.currency::text from public.financial_ledger_entries l
  where l.doctor_id = auth.uid() and l.currency = v_currency
    and l.entry_type in ('refund_reversal', 'adjustment')
    and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id)
    and not exists (select 1 from invoice_entries e where e.id = l.id);
  select sum(amount) into v_gross from invoice_entries;
  if coalesce(v_gross, 0) <= 0 then
    raise exception 'NOTHING_TO_PAY' using errcode = 'P0001';
  end if;
  if v_kyc.bank_country = any (array(select jsonb_array_elements_text(coalesce(v_tds -> 'countries', '[]'::jsonb)))) then
    v_rate := coalesce((v_tds ->> 'rate_bps')::integer, 0);
  end if;
  v_tds_amount := floor((v_gross * v_rate + 5000) / 10000);

  insert into public.doctor_payouts (doctor_id, currency, amount, status, source, invoice_number, gross_amount,
    tds_rate_bps, tds_amount, bank_snapshot, submitted_at, created_by)
  values (auth.uid(), v_currency, v_gross - v_tds_amount, 'pending', 'invoice',
    'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
    v_gross, v_rate, v_tds_amount,
    to_jsonb(v_kyc) - 'kyc_note' - 'verified_by' - 'updated_at' - 'doctor_id',
    now(), auth.uid())
  returning * into v_payout;
  insert into public.payout_items (payout_id, ledger_entry_id) select v_payout.id, id from invoice_entries;

  perform public.notify_admins('finance.manage', 'invoice-submitted:' || v_payout.id::text, 'Invoice submitted',
    'Invoice ' || v_payout.invoice_number || ' is waiting for approval.', '/admin/finance/invoices/' || v_payout.id::text);
  perform public.audit('invoice.submit', 'doctor_payout', v_payout.id::text,
    jsonb_build_object('invoice_number', v_payout.invoice_number, 'gross', v_gross, 'tds', v_tds_amount, 'currency', v_currency));
  return v_payout;
end;
$$;

create function public.withdraw_invoice(p_payout uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.doctor_payouts;
begin
  select * into v_p from public.doctor_payouts where id = p_payout for update;
  if not found or v_p.doctor_id is distinct from auth.uid() or v_p.source <> 'invoice' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_p.status::text <> 'pending' then
    raise exception 'NOT_PENDING' using errcode = 'P0001';
  end if;
  update public.doctor_payouts set status = 'cancelled'::text::public.payout_status where id = p_payout;
  delete from public.payout_items where payout_id = p_payout;
  perform public.audit('invoice.withdraw', 'doctor_payout', p_payout::text, '{}'::jsonb);
end;
$$;

create function public.reject_invoice(p_payout uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.doctor_payouts;
  v_reason text := nullif(trim(p_reason), '');
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_p from public.doctor_payouts where id = p_payout for update;
  if not found or v_p.source <> 'invoice' then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_p.status::text not in ('pending', 'under_review', 'approved') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if v_reason is null then
    raise exception 'NOTE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.doctor_payouts set status = 'failed', rejection_reason = left(v_reason, 1000) where id = p_payout;
  -- Release the consultations so they can be invoiced again.
  delete from public.payout_items where payout_id = p_payout;
  perform public.enqueue_notification(v_p.doctor_id, null, 'invoice-rejected:' || p_payout::text, '{}'::jsonb,
    'Invoice ' || v_p.invoice_number || ' was rejected', v_reason, '/doctor/invoices/' || p_payout::text);
  perform public.audit('invoice.reject', 'doctor_payout', p_payout::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.invoiceable_entries(), public.submit_invoice(uuid[]),
  public.withdraw_invoice(uuid), public.reject_invoice(uuid, text) from public, anon;
grant execute on function public.invoiceable_entries(), public.submit_invoice(uuid[]),
  public.withdraw_invoice(uuid), public.reject_invoice(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Invoices move only through invoice states: on_hold / processing / failed would strand them outside
-- the invoice queue or reject them without a reason, so those go through reject_invoice() instead.
-- (Same body as 20261029000006_rpcs.sql plus the source guard.)
-- ---------------------------------------------------------------------------
create or replace function public.update_payout_status(
  p_payout uuid,
  p_status public.payout_status,
  p_reference text default null,
  p_method text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.doctor_payouts;
  v_allowed boolean;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_p from public.doctor_payouts where id = p_payout for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_p.source = 'invoice' and p_status::text not in ('under_review', 'approved', 'paid') then
    raise exception 'INVALID_TRANSITION: invoices are rejected with reject_invoice()' using errcode = 'P0001';
  end if;
  v_allowed := (v_p.status::text, p_status::text) in (
    ('pending', 'under_review'), ('pending', 'approved'), ('pending', 'on_hold'),
    ('under_review', 'approved'), ('under_review', 'on_hold'),
    ('on_hold', 'under_review'), ('on_hold', 'approved'), ('on_hold', 'failed'),
    ('approved', 'processing'), ('approved', 'paid'), ('approved', 'on_hold'),
    ('processing', 'paid'), ('processing', 'failed'),
    ('pending', 'failed'), ('under_review', 'failed')
  );
  if not v_allowed then
    raise exception 'INVALID_TRANSITION: % -> %', v_p.status, p_status using errcode = 'P0001';
  end if;
  if p_status = 'paid' and coalesce(trim(p_reference), '') = '' then
    raise exception 'TRANSACTION_REFERENCE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.doctor_payouts
  set status = p_status,
      transaction_reference = coalesce(nullif(trim(p_reference), ''), transaction_reference),
      payout_method = coalesce(nullif(trim(p_method), ''), payout_method),
      notes = coalesce(nullif(trim(p_notes), ''), notes),
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      paid_at = case when p_status = 'paid' then now() else paid_at end
  where id = p_payout;
  if p_status = 'paid' then
    insert into public.financial_ledger_entries (doctor_id, entry_type, currency, amount, payout_id, description, created_by)
    values (v_p.doctor_id, 'payout', v_p.currency, -v_p.amount, v_p.id,
            'Payout ' || coalesce(nullif(trim(p_reference), ''), v_p.transaction_reference), auth.uid());
  elsif p_status = 'failed' then
    -- Release the entries so a later settlement can include them again.
    delete from public.payout_items where payout_id = p_payout;
  end if;
  perform public.enqueue_notification(v_p.doctor_id, 'payout_' || p_status::text,
    'payout:' || p_payout::text || ':' || p_status::text,
    jsonb_build_object('amount', v_p.amount, 'currency', v_p.currency, 'status', p_status),
    'Payout ' || replace(p_status::text, '_', ' '), null, '/doctor/earnings');
  perform public.audit('payout.' || p_status::text, 'doctor_payout', p_payout::text,
    jsonb_build_object('amount', v_p.amount, 'currency', v_p.currency));
end;
$$;

-- ---------------------------------------------------------------------------
-- Bank snapshot: full account number / PAN / tax id are never readable directly. The doctor and finance
-- get a masked copy; finance gets full numbers only through audited functions (as with Part 1's reveal).
-- ---------------------------------------------------------------------------
revoke select on public.doctor_payouts from authenticated;
grant select (id, batch_id, doctor_id, currency, amount, status, payout_method, transaction_reference, notes,
  approved_by, approved_at, paid_at, created_by, created_at, updated_at, source, invoice_number, gross_amount,
  tds_rate_bps, tds_amount, rejection_reason, submitted_at) on public.doctor_payouts to authenticated;

create function public.invoice_bank_masked(p_payout uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p public.doctor_payouts;
  s jsonb;
begin
  select * into v_p from public.doctor_payouts where id = p_payout and source = 'invoice';
  if not found or not (v_p.doctor_id = auth.uid() or public.has_permission('finance.manage')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  s := coalesce(v_p.bank_snapshot, '{}'::jsonb);
  return (s - 'account_number' - 'routing_number' - 'pan' - 'tax_id') || jsonb_strip_nulls(jsonb_build_object(
    'account_masked', case when s ->> 'account_number' is not null then '••••' || right(s ->> 'account_number', 4) end,
    'routing_masked', case when s ->> 'routing_number' is not null then '•••••' || right(s ->> 'routing_number', 4) end,
    'pan_masked', case when s ->> 'pan' is not null then left(s ->> 'pan', 2) || '••••' || right(s ->> 'pan', 2) end,
    'tax_id_masked', case when s ->> 'tax_id' is not null then '•••••' || right(s ->> 'tax_id', 4) end));
end;
$$;

-- The account to pay is the one the invoice was raised (and verified) with, not whatever is current.
create function public.reveal_invoice_bank(p_payout uuid)
returns table (account_holder_name text, bank_name text, account_number text, ifsc text, sort_code text,
  routing_number text, account_type text, pan text, tax_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select bank_snapshot into s from public.doctor_payouts where id = p_payout and source = 'invoice';
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public.audit('invoice_bank.reveal', 'doctor_payout', p_payout::text, '{}'::jsonb);
  return query select s ->> 'account_holder_name', s ->> 'bank_name', s ->> 'account_number', s ->> 'ifsc', s ->> 'sort_code',
    s ->> 'routing_number', s ->> 'account_type', s ->> 'pan', s ->> 'tax_id';
end;
$$;

create function public.tds_report(p_from date, p_to date)
returns table (invoice_number text, paid_at timestamptz, doctor_name text, pan text, currency text, gross_amount bigint,
  tds_rate_bps integer, tds_amount bigint, net_amount bigint, transaction_reference text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public.audit('tds.export', 'report', 'tds', jsonb_build_object('from', p_from, 'to', p_to));
  return query
  select p.invoice_number, p.paid_at, trim(d.title || ' ' || d.display_name), p.bank_snapshot ->> 'pan', p.currency::text,
         p.gross_amount, p.tds_rate_bps, p.tds_amount, p.amount, p.transaction_reference
  from public.doctor_payouts p
  join public.doctor_profiles d on d.user_id = p.doctor_id
  where p.source = 'invoice' and p.status = 'paid' and p.tds_amount > 0
    and (p_from is null or p.paid_at >= p_from::timestamptz)
    and (p_to is null or p.paid_at < (p_to + 1)::timestamptz)
  order by p.paid_at;
end;
$$;

revoke execute on function public.invoice_bank_masked(uuid), public.reveal_invoice_bank(uuid), public.tds_report(date, date) from public, anon;
grant execute on function public.invoice_bank_masked(uuid), public.reveal_invoice_bank(uuid), public.tds_report(date, date) to authenticated;
