-- Payments, refunds, ledger, payouts, notifications, email outbox, audit, rate limits.

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id),
  patient_id uuid not null references public.profiles (id),
  purpose text not null check (purpose in ('booking', 'upgrade')),
  upgrade_to public.consultation_mode,
  provider text not null check (provider in ('stripe', 'manual')),
  provider_checkout_id text unique,
  provider_payment_id text unique,
  amount bigint not null check (amount > 0),
  currency char(3) not null references public.currencies (code),
  status public.payment_status not null default 'pending',
  amount_refunded bigint not null default 0 check (amount_refunded >= 0),
  failure_reason text check (char_length(failure_reason) <= 500),
  succeeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_refunded <= amount),
  check ((purpose = 'upgrade') = (upgrade_to is not null))
);
create unique index payment_records_one_pending on public.payment_records (appointment_id, purpose)
  where status = 'pending';
create index payment_records_patient_idx on public.payment_records (patient_id, created_at desc);
create trigger payment_records_updated_at before update on public.payment_records
  for each row execute function public.set_updated_at();

-- Webhook de-duplication: an event id is processed at most once.
create table public.payment_webhook_events (
  provider text not null,
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (provider, event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payment_records (id),
  appointment_id uuid not null references public.appointments (id),
  amount bigint not null check (amount > 0),
  currency char(3) not null references public.currencies (code),
  status public.refund_status not null default 'pending',
  reason text not null check (char_length(reason) <= 500),
  provider_refund_id text unique,
  failure_reason text,
  requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index refunds_status_idx on public.refunds (status, created_at);

-- ---------------------------------------------------------------------------
-- Ledger: append-only. Positive = owed to the doctor; negative = reduces the balance.
-- ---------------------------------------------------------------------------
create table public.financial_ledger_entries (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctor_profiles (user_id),
  entry_type public.ledger_entry_type not null,
  currency char(3) not null references public.currencies (code),
  amount bigint not null check (amount <> 0),
  gross_amount bigint,
  commission_amount bigint,
  appointment_id uuid references public.appointments (id),
  refund_id uuid references public.refunds (id),
  payout_id uuid,
  description text not null check (char_length(description) <= 500),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (entry_type <> 'consultation_earning' or (appointment_id is not null and amount > 0)),
  check (entry_type <> 'refund_reversal' or (refund_id is not null and amount < 0)),
  check (entry_type <> 'payout' or (payout_id is not null and amount < 0))
);
create unique index ledger_one_earning_per_appointment on public.financial_ledger_entries (appointment_id)
  where entry_type = 'consultation_earning';
create unique index ledger_one_reversal_per_refund on public.financial_ledger_entries (refund_id)
  where entry_type = 'refund_reversal';
create unique index ledger_one_entry_per_payout on public.financial_ledger_entries (payout_id)
  where entry_type = 'payout';
create index ledger_doctor_idx on public.financial_ledger_entries (doctor_id, currency, created_at);
create trigger ledger_immutable before update or delete on public.financial_ledger_entries
  for each row execute function public.prevent_mutation();

create table public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  settlement_date date not null,
  currency char(3) not null references public.currencies (code),
  cutoff_at timestamptz not null,
  notes text check (char_length(notes) <= 1000),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (settlement_date, currency)
);

create table public.doctor_payouts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payout_batches (id),
  doctor_id uuid not null references public.doctor_profiles (user_id),
  currency char(3) not null references public.currencies (code),
  amount bigint not null check (amount > 0),
  status public.payout_status not null default 'pending',
  payout_method text check (char_length(payout_method) <= 100),
  transaction_reference text check (char_length(transaction_reference) <= 200),
  notes text check (char_length(notes) <= 1000),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, doctor_id),
  -- "Paid" requires evidence; a status flip alone is not proof of transfer.
  check (status <> 'paid' or (
    transaction_reference is not null and length(trim(transaction_reference)) > 0 and paid_at is not null
  ))
);
create index doctor_payouts_doctor_idx on public.doctor_payouts (doctor_id, created_at desc);
create trigger doctor_payouts_updated_at before update on public.doctor_payouts
  for each row execute function public.set_updated_at();

alter table public.financial_ledger_entries
  add constraint ledger_payout_fk foreign key (payout_id) references public.doctor_payouts (id);

-- Which ledger entries a payout settles. Each entry can belong to at most one payout.
create table public.payout_items (
  payout_id uuid not null references public.doctor_payouts (id) on delete cascade,
  ledger_entry_id bigint not null unique references public.financial_ledger_entries (id),
  primary key (payout_id, ledger_entry_id)
);

-- ---------------------------------------------------------------------------
-- Notifications and email outbox
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dedupe_key text unique,
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  link text check (link is null or link like '/%'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Payloads carry names, times and links only: never clinical content.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  to_user_id uuid references public.profiles (id) on delete set null,
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.outbox_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_outbox_due_idx on public.email_outbox (status, next_attempt_at);

create function public.enqueue_notification(
  p_user uuid,
  p_template text,
  p_dedupe_key text,
  p_payload jsonb,
  p_title text,
  p_body text,
  p_link text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select email into v_email from public.profiles where id = p_user;
  if v_email is null then
    return;
  end if;
  insert into public.notifications (user_id, dedupe_key, title, body, link)
  values (p_user, p_dedupe_key, p_title, p_body, p_link)
  on conflict (dedupe_key) do nothing;
  if p_template is not null then
    insert into public.email_outbox (dedupe_key, to_user_id, to_email, template, payload)
    values (p_dedupe_key, p_user, v_email, p_template, coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('link', p_link))
    on conflict (dedupe_key) do nothing;
  end if;
end;
$$;

create function public.notify_admins(p_permission text, p_dedupe_key text, p_title text, p_body text, p_link text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
begin
  for v_admin in
    select distinct ap.user_id from public.admin_permissions ap
    join public.profiles p on p.id = ap.user_id
    where p.role = 'admin' and p.is_active and ap.permission in (p_permission, '*')
  loop
    perform public.enqueue_notification(v_admin, null, p_dedupe_key || ':' || v_admin::text, null, p_title, p_body, p_link);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit log (append-only; metadata must not contain clinical content)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_role public.app_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();

create function public.audit_as(
  p_actor uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (p_actor, (select role from public.profiles where id = p_actor), p_action, p_entity_type, p_entity_id,
          coalesce(p_metadata, '{}'::jsonb))
$$;

create function public.audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.audit_as(auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata)
$$;

-- ---------------------------------------------------------------------------
-- Fixed-window rate limiter (called by the server with the service role)
-- ---------------------------------------------------------------------------
create table public.rate_limit_buckets (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

create function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.rate_limit_buckets as b (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
    set hits = case when b.window_start < now() - make_interval(secs => p_window_seconds) then 1 else b.hits + 1 end,
        window_start = case when b.window_start < now() - make_interval(secs => p_window_seconds) then now() else b.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;
