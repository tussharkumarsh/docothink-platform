-- Availability, appointments, state machine, change requests.

-- Local wall-clock windows interpreted in `timezone` (the zone the doctor wrote them in).
-- end_time may be '24:00' to mean end of day. Windows never cross midnight; create two rules instead.
create table public.doctor_availability_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles (user_id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- ISO 8601: 1 = Monday
  start_time time not null,
  end_time time not null,
  timezone text not null check (public.is_valid_timezone(timezone)),
  slot_minutes smallint not null check (slot_minutes between 10 and 180),
  buffer_minutes smallint not null default 0 check (buffer_minutes between 0 and 120),
  modes public.consultation_mode[] not null check (cardinality(modes) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(second from start_time) = 0 and extract(second from end_time) = 0),
  check (public.minutes_of_day(end_time) - public.minutes_of_day(start_time) >= slot_minutes)
);
create index availability_rules_doctor_idx on public.doctor_availability_rules (doctor_id, weekday);
create trigger availability_rules_updated_at before update on public.doctor_availability_rules
  for each row execute function public.set_updated_at();

-- Rules for the same doctor/weekday/zone must not overlap (keeps buffers meaningful).
create function public.guard_rule_overlap()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_active and exists (
    select 1 from public.doctor_availability_rules r
    where r.doctor_id = new.doctor_id
      and r.weekday = new.weekday
      and r.is_active
      and r.id <> new.id
      and r.timezone = new.timezone
      and public.minutes_of_day(r.start_time) < public.minutes_of_day(new.end_time)
      and public.minutes_of_day(new.start_time) < public.minutes_of_day(r.end_time)
  ) then
    raise exception 'RULE_OVERLAP: this window overlaps another window on the same day'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger availability_rules_no_overlap before insert or update on public.doctor_availability_rules
  for each row execute function public.guard_rule_overlap();

create table public.doctor_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles (user_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index availability_exceptions_doctor_idx on public.doctor_availability_exceptions (doctor_id, starts_at);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default ('DT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  patient_id uuid not null references public.patient_profiles (user_id),
  doctor_id uuid not null references public.doctor_profiles (user_id),
  specialty_id uuid references public.specialties (id),
  mode public.consultation_mode not null,
  status public.appointment_status not null default 'pending_payment',
  start_at timestamptz not null,
  end_at timestamptz not null,
  doctor_timezone text not null check (public.is_valid_timezone(doctor_timezone)),
  patient_timezone text not null check (public.is_valid_timezone(patient_timezone)),
  currency char(3) not null references public.currencies (code),
  -- Prices of every mode at booking time; upgrades are priced from this snapshot.
  fee_snapshot jsonb not null check (jsonb_typeof(fee_snapshot) = 'object'),
  fee_amount bigint not null check (fee_amount > 0),
  amount_paid bigint not null default 0 check (amount_paid >= 0),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  payment_expires_at timestamptz,
  reschedule_count integer not null default 0,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  cancellation_reason text check (char_length(cancellation_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at),
  -- Database-level guarantee: no two slot-holding appointments overlap for a doctor or a patient.
  constraint appointments_doctor_no_overlap exclude using gist (
    doctor_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending_payment', 'confirmed', 'in_progress')),
  constraint appointments_patient_no_overlap exclude using gist (
    patient_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('pending_payment', 'confirmed', 'in_progress'))
);
create index appointments_patient_idx on public.appointments (patient_id, start_at desc);
create index appointments_doctor_idx on public.appointments (doctor_id, start_at desc);
create index appointments_status_start_idx on public.appointments (status, start_at);
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

-- Clinical intake is kept apart from scheduling data so admins without
-- clinical.read can manage appointments without seeing symptoms.
create table public.appointment_intakes (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  reason_for_visit text not null check (char_length(reason_for_visit) between 1 and 4000),
  symptoms_duration text check (char_length(symptoms_duration) <= 200),
  specialty_answers jsonb not null default '{}'::jsonb check (jsonb_typeof(specialty_answers) = 'object'),
  updated_at timestamptz not null default now()
);

create table public.appointment_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  event text not null,
  from_status public.appointment_status,
  to_status public.appointment_status,
  actor_id uuid,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index appointment_events_appt_idx on public.appointment_events (appointment_id, created_at);

create function public.appointment_transition_allowed(
  p_from public.appointment_status,
  p_to public.appointment_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or (p_from::text, p_to::text) in (
    ('pending_payment', 'confirmed'),
    ('pending_payment', 'expired'),
    ('pending_payment', 'cancelled'),
    ('expired', 'confirmed'),        -- late payment webhook, only if the slot is still free
    ('confirmed', 'in_progress'),
    ('confirmed', 'cancelled'),
    ('confirmed', 'no_show'),
    ('in_progress', 'completed'),
    ('in_progress', 'cancelled'),    -- e.g. technical failure; refund handled separately
    ('cancelled', 'refunded'),
    ('no_show', 'refunded'),
    ('completed', 'refunded')
  )
$$;

create function public.enforce_appointment_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.appointment_transition_allowed(old.status, new.status) then
    raise exception 'INVALID_TRANSITION: % -> %', old.status, new.status using errcode = 'P0001';
  end if;
  -- Identity of an appointment never changes.
  if new.patient_id <> old.patient_id or new.doctor_id <> old.doctor_id or new.currency <> old.currency then
    raise exception 'IMMUTABLE_FIELDS: patient, doctor and currency cannot change' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger appointments_transition before update on public.appointments
  for each row execute function public.enforce_appointment_transition();

create function public.log_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_events (appointment_id, event, to_status, actor_id)
    values (new.id, 'created', new.status, auth.uid());
  else
    if new.status <> old.status then
      insert into public.appointment_events (appointment_id, event, from_status, to_status, actor_id)
      values (new.id, 'status_changed', old.status, new.status, auth.uid());
    end if;
    if new.start_at <> old.start_at then
      insert into public.appointment_events (appointment_id, event, actor_id, metadata)
      values (new.id, 'rescheduled', auth.uid(),
              jsonb_build_object('from_start', old.start_at, 'to_start', new.start_at));
    end if;
    if new.mode <> old.mode then
      insert into public.appointment_events (appointment_id, event, actor_id, metadata)
      values (new.id, 'mode_changed', auth.uid(),
              jsonb_build_object('from_mode', old.mode, 'to_mode', new.mode));
    end if;
  end if;
  return new;
end;
$$;
create trigger appointments_log after insert or update on public.appointments
  for each row execute function public.log_appointment_change();

create table public.appointment_change_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  proposed_start_at timestamptz not null,
  proposed_end_at timestamptz not null,
  reason text check (char_length(reason) <= 1000),
  status public.change_request_status not null default 'pending',
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  created_at timestamptz not null default now(),
  check (proposed_end_at > proposed_start_at)
);
create unique index change_requests_one_pending on public.appointment_change_requests (appointment_id)
  where status = 'pending';
create index change_requests_status_idx on public.appointment_change_requests (status, created_at);

-- ---------------------------------------------------------------------------
-- Slot validation: the database's own, DST-aware re-derivation of a slot.
-- Raises 'SLOT_*' errors; returns the slot length in minutes when bookable.
-- ---------------------------------------------------------------------------
create function public.assert_slot_bookable(
  p_doctor uuid,
  p_start timestamptz,
  p_mode public.consultation_mode,
  p_exclude_appointment uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc public.doctor_profiles;
  v_rule record;
  v_local timestamp;
  v_start_min integer;
  v_slot integer;
  v_end timestamptz;
  v_horizon integer;
  v_max_horizon integer := coalesce((public.setting('booking') ->> 'max_horizon_days')::integer, 30);
begin
  select * into v_doc from public.doctor_profiles where user_id = p_doctor;
  if not found or v_doc.application_status <> 'approved' or not v_doc.is_accepting_bookings
     or not exists (select 1 from public.profiles where id = p_doctor and is_active) then
    raise exception 'SLOT_DOCTOR_UNAVAILABLE' using errcode = 'P0001';
  end if;

  if p_start < now() + make_interval(mins => v_doc.min_notice_minutes) then
    raise exception 'SLOT_TOO_SOON' using errcode = 'P0001';
  end if;

  -- Horizon N days = doctor-local today .. today + N - 1.
  v_horizon := least(v_doc.booking_horizon_days, v_max_horizon);
  if (p_start at time zone v_doc.timezone)::date > (now() at time zone v_doc.timezone)::date + (v_horizon - 1) then
    raise exception 'SLOT_BEYOND_HORIZON' using errcode = 'P0001';
  end if;

  for v_rule in
    select * from public.doctor_availability_rules
    where doctor_id = p_doctor and is_active and p_mode = any (modes)
  loop
    v_local := p_start at time zone v_rule.timezone;
    continue when extract(isodow from v_local)::integer <> v_rule.weekday;
    continue when extract(second from v_local) <> 0;
    v_start_min := (extract(hour from v_local) * 60 + extract(minute from v_local))::integer;
    if v_start_min >= public.minutes_of_day(v_rule.start_time)
       and v_start_min + v_rule.slot_minutes <= public.minutes_of_day(v_rule.end_time)
       and (v_start_min - public.minutes_of_day(v_rule.start_time))
           % (v_rule.slot_minutes + v_rule.buffer_minutes) = 0 then
      v_slot := v_rule.slot_minutes;
      exit;
    end if;
  end loop;

  if v_slot is null then
    raise exception 'SLOT_NOT_IN_SCHEDULE' using errcode = 'P0001';
  end if;

  v_end := p_start + make_interval(mins => v_slot);

  if exists (
    select 1 from public.doctor_availability_exceptions e
    where e.doctor_id = p_doctor and e.starts_at < v_end and e.ends_at > p_start
  ) then
    raise exception 'SLOT_BLOCKED' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.appointments a
    where a.doctor_id = p_doctor
      and a.id is distinct from p_exclude_appointment
      and a.status in ('pending_payment', 'confirmed', 'in_progress')
      and not (a.status = 'pending_payment' and a.payment_expires_at < now())
      and a.start_at < v_end and a.end_at > p_start
  ) then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end if;

  return v_slot;
end;
$$;

-- Busy intervals for public slot generation: times only, never who or why.
create function public.get_doctor_busy_intervals(p_doctor uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.start_at, a.end_at
  from public.appointments a
  where a.doctor_id = p_doctor
    and a.status in ('pending_payment', 'confirmed', 'in_progress')
    and not (a.status = 'pending_payment' and a.payment_expires_at < now())
    and a.start_at < p_to and a.end_at > p_from
  union all
  select e.starts_at, e.ends_at
  from public.doctor_availability_exceptions e
  where e.doctor_id = p_doctor and e.starts_at < p_to and e.ends_at > p_from
$$;
