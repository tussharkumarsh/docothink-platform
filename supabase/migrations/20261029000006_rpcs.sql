-- Business operations. Every mutating path for appointments, payments, prescriptions,
-- ledger and payouts goes through these SECURITY DEFINER functions, which authorise
-- the caller themselves (clients have no direct UPDATE on those tables).
-- Errors use stable codes ('SLOT_TAKEN', 'FORBIDDEN', ...) that the app maps to messages.

-- ---------------------------------------------------------------------------
-- Pure helpers
-- ---------------------------------------------------------------------------
-- Commission is rounded half-up on non-negative integers; net is the remainder so parts sum to gross.
create function public.split_commission(p_gross bigint, p_bps integer, out commission bigint, out net bigint)
language sql
immutable
set search_path = ''
as $$
  select (p_gross * p_bps + 5000) / 10000, p_gross - (p_gross * p_bps + 5000) / 10000
$$;

create function public.doctor_fee_for_mode(p_doctor public.doctor_profiles, p_mode public.consultation_mode)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_mode
    when 'chat' then p_doctor.fee_chat
    when 'audio' then p_doctor.fee_audio
    when 'video' then p_doctor.fee_video
  end
$$;

-- Slot length of the rule whose grid contains p_start for p_mode, or NULL.
create function public.find_slot_rule_minutes(p_doctor uuid, p_start timestamptz, p_mode public.consultation_mode)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rule record;
  v_local timestamp;
  v_start_min integer;
begin
  for v_rule in
    select * from public.doctor_availability_rules
    where doctor_id = p_doctor and is_active and p_mode = any (modes)
  loop
    v_local := p_start at time zone v_rule.timezone;
    continue when extract(isodow from v_local)::integer <> v_rule.weekday;
    v_start_min := (extract(hour from v_local) * 60 + extract(minute from v_local))::integer;
    if v_start_min >= public.minutes_of_day(v_rule.start_time)
       and v_start_min + v_rule.slot_minutes <= public.minutes_of_day(v_rule.end_time)
       and (v_start_min - public.minutes_of_day(v_rule.start_time))
           % (v_rule.slot_minutes + v_rule.buffer_minutes) = 0 then
      return v_rule.slot_minutes;
    end if;
  end loop;
  return null;
end;
$$;

create function public.refunded_total(p_appointment uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::bigint from public.refunds
  where appointment_id = p_appointment and status <> 'failed'
$$;

create function public.appointment_link(p_role public.app_role, p_appointment uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'patient' then '/patient/appointments/' || p_appointment::text
    when 'doctor' then '/doctor/appointments/' || p_appointment::text
    else '/admin/appointments/' || p_appointment::text
  end
$$;

-- Email payload for appointment notifications: names, times, zones, mode, status. No clinical data.
create function public.appointment_email_payload(p_appointment uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reference', a.reference,
    'start_at', a.start_at,
    'end_at', a.end_at,
    'patient_timezone', a.patient_timezone,
    'doctor_timezone', a.doctor_timezone,
    'mode', a.mode,
    'status', a.status,
    'patient_name', pp.full_name,
    'doctor_name', trim(d.title || ' ' || d.display_name)
  )
  from public.appointments a
  join public.profiles pp on pp.id = a.patient_id
  join public.doctor_profiles d on d.user_id = a.doctor_id
  where a.id = p_appointment
$$;

create function public.notify_appointment_parties(p_appointment uuid, p_event text, p_title text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_payload jsonb := public.appointment_email_payload(p_appointment);
begin
  select * into v_a from public.appointments where id = p_appointment;
  perform public.enqueue_notification(
    v_a.patient_id, p_event, p_event || ':' || p_appointment::text || ':patient:' || v_a.updated_at::text,
    v_payload || jsonb_build_object('recipient_role', 'patient', 'recipient_timezone', v_a.patient_timezone),
    p_title, p_body, public.appointment_link('patient', p_appointment));
  perform public.enqueue_notification(
    v_a.doctor_id, p_event, p_event || ':' || p_appointment::text || ':doctor:' || v_a.updated_at::text,
    v_payload || jsonb_build_object('recipient_role', 'doctor', 'recipient_timezone', v_a.doctor_timezone),
    p_title, p_body, public.appointment_link('doctor', p_appointment));
end;
$$;

-- ---------------------------------------------------------------------------
-- Booking
-- ---------------------------------------------------------------------------
create function public.book_appointment(
  p_doctor uuid,
  p_start timestamptz,
  p_mode public.consultation_mode,
  p_reason text,
  p_patient_timezone text,
  p_symptoms_duration text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid := auth.uid();
  v_doc public.doctor_profiles;
  v_slot integer;
  v_fee bigint;
  v_specialty uuid;
  v_appt public.appointments;
  v_constraint text;
  v_hold integer := coalesce((public.setting('booking') ->> 'payment_hold_minutes')::integer, 15);
begin
  if v_patient is null or public.current_app_role() is distinct from 'patient' then
    raise exception 'FORBIDDEN: only patient accounts can book' using errcode = '42501';
  end if;
  if not public.is_valid_timezone(p_patient_timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  -- Serialise bookings per doctor for clean errors; the exclusion constraint is the hard guarantee.
  perform pg_advisory_xact_lock(hashtextextended('book:' || p_doctor::text, 0));

  update public.appointments set status = 'expired'
  where status = 'pending_payment' and payment_expires_at < now()
    and (doctor_id = p_doctor or patient_id = v_patient);

  v_slot := public.assert_slot_bookable(p_doctor, p_start, p_mode, null);

  select * into v_doc from public.doctor_profiles where user_id = p_doctor;
  v_fee := public.doctor_fee_for_mode(v_doc, p_mode);
  if v_fee is null then
    raise exception 'MODE_NOT_OFFERED' using errcode = 'P0001';
  end if;

  select specialty_id into v_specialty from public.doctor_specialties
  where doctor_id = p_doctor order by is_primary desc limit 1;

  begin
    insert into public.appointments (
      patient_id, doctor_id, specialty_id, mode, status, start_at, end_at,
      doctor_timezone, patient_timezone, currency, fee_snapshot, fee_amount,
      commission_bps, payment_expires_at
    ) values (
      v_patient, p_doctor, v_specialty, p_mode, 'pending_payment', p_start,
      p_start + make_interval(mins => v_slot),
      v_doc.timezone, p_patient_timezone, v_doc.currency,
      jsonb_strip_nulls(jsonb_build_object('chat', v_doc.fee_chat, 'audio', v_doc.fee_audio, 'video', v_doc.fee_video)),
      v_fee, public.effective_commission_bps(p_doctor), now() + make_interval(mins => v_hold)
    ) returning * into v_appt;
  exception when exclusion_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'appointments_patient_no_overlap' then
      raise exception 'PATIENT_OVERLAP' using errcode = 'P0001';
    end if;
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into public.appointment_intakes (appointment_id, reason_for_visit, symptoms_duration)
  values (v_appt.id, left(trim(p_reason), 4000), left(p_symptoms_duration, 200));

  return v_appt;
end;
$$;

-- Creates the pending payment record; the amount is decided here, never by the client.
create function public.create_payment_record(
  p_appointment uuid,
  p_purpose text,
  p_upgrade_to public.consultation_mode default null,
  p_provider text default 'stripe'
)
returns public.payment_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_amount bigint;
  v_payment public.payment_records;
begin
  select * into v_a from public.appointments where id = p_appointment for update;
  if not found or v_a.patient_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_purpose = 'booking' then
    if v_a.status <> 'pending_payment' or v_a.payment_expires_at < now() then
      raise exception 'PAYMENT_WINDOW_CLOSED' using errcode = 'P0001';
    end if;
    v_amount := v_a.fee_amount - v_a.amount_paid;
  elsif p_purpose = 'upgrade' then
    if v_a.status <> 'confirmed' or v_a.start_at <= now() then
      raise exception 'UPGRADE_NOT_ALLOWED' using errcode = 'P0001';
    end if;
    if p_upgrade_to is null or not (v_a.fee_snapshot ? p_upgrade_to::text) then
      raise exception 'MODE_NOT_OFFERED' using errcode = 'P0001';
    end if;
    v_amount := (v_a.fee_snapshot ->> p_upgrade_to::text)::bigint - v_a.fee_amount;
    if v_amount <= 0 then
      raise exception 'UPGRADE_NOT_PRICED: only upgrades to a higher-priced mode are supported' using errcode = 'P0001';
    end if;
    if public.find_slot_rule_minutes(v_a.doctor_id, v_a.start_at, p_upgrade_to)
       is distinct from (extract(epoch from v_a.end_at - v_a.start_at) / 60)::integer then
      raise exception 'UPGRADE_REQUIRES_RESCHEDULE' using errcode = 'P0001';
    end if;
  else
    raise exception 'INVALID_PURPOSE' using errcode = 'P0001';
  end if;

  if v_amount <= 0 then
    raise exception 'NOTHING_TO_PAY' using errcode = 'P0001';
  end if;

  -- A previous unfinished checkout is superseded. If it is paid anyway, confirm_payment still honours it.
  update public.payment_records set status = 'cancelled'
  where appointment_id = p_appointment and purpose = p_purpose and status = 'pending';

  insert into public.payment_records (appointment_id, patient_id, purpose, upgrade_to, provider, amount, currency)
  values (p_appointment, v_a.patient_id, p_purpose,
          case when p_purpose = 'upgrade' then p_upgrade_to end, p_provider, v_amount, v_a.currency)
  returning * into v_payment;
  return v_payment;
end;
$$;

create function public.set_payment_checkout(p_payment uuid, p_checkout_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_records set provider_checkout_id = p_checkout_id
  where id = p_payment and provider_checkout_id is null
$$;

-- Internal: create refund rows for p_amount across the appointment's succeeded payments (newest first).
create function public.create_refunds(p_appointment uuid, p_amount bigint, p_reason text, p_actor uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_left bigint := p_amount;
  v_take bigint;
  v_pending bigint;
begin
  for v_p in
    select * from public.payment_records
    where appointment_id = p_appointment and status in ('succeeded', 'partially_refunded')
    order by succeeded_at desc
  loop
    exit when v_left <= 0;
    select coalesce(sum(amount), 0) into v_pending from public.refunds
    where payment_id = v_p.id and status <> 'failed';
    v_take := least(v_left, v_p.amount - v_pending);
    continue when v_take <= 0;
    insert into public.refunds (payment_id, appointment_id, amount, currency, reason, requested_by)
    values (v_p.id, p_appointment, v_take, v_p.currency, left(p_reason, 500), p_actor);
    v_left := v_left - v_take;
  end loop;
  return p_amount - v_left;
end;
$$;

-- Called by the payment webhook (service role) after the provider verified the payment.
create function public.confirm_payment(
  p_payment uuid,
  p_provider_payment_id text,
  p_amount bigint,
  p_currency text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.payment_records;
  v_a public.appointments;
  v_ok boolean := false;
begin
  select * into v_p from public.payment_records where id = p_payment for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_p.status in ('succeeded', 'partially_refunded', 'refunded') then
    return 'already_processed';
  end if;
  if p_amount <> v_p.amount or upper(p_currency) <> v_p.currency then
    update public.payment_records set status = 'failed', failure_reason = 'AMOUNT_MISMATCH',
      provider_payment_id = p_provider_payment_id where id = p_payment;
    perform public.notify_admins('finance.manage', 'payment-mismatch:' || p_payment::text,
      'Payment amount mismatch', 'A provider payment did not match the expected amount. Manual review needed.',
      '/admin/finance');
    return 'amount_mismatch';
  end if;

  update public.payment_records
  set status = 'succeeded', provider_payment_id = p_provider_payment_id, succeeded_at = now()
  where id = p_payment;

  select * into v_a from public.appointments where id = v_p.appointment_id for update;

  if v_p.purpose = 'booking' and v_a.status in ('pending_payment', 'expired') then
    begin
      update public.appointments
      set status = 'confirmed', amount_paid = amount_paid + v_p.amount, payment_expires_at = null
      where id = v_a.id;
      v_ok := true;
    exception when exclusion_violation then
      v_ok := false; -- the hold expired and someone else booked the slot meanwhile
    end;
    if v_ok then
      insert into public.consultations (appointment_id) values (v_a.id) on conflict do nothing;
      perform public.notify_appointment_parties(v_a.id, 'appointment_confirmed',
        'Appointment confirmed', 'Your consultation is booked.');
      return 'confirmed';
    end if;
  elsif v_p.purpose = 'upgrade' and v_a.status = 'confirmed' and v_a.start_at > now()
        and public.find_slot_rule_minutes(v_a.doctor_id, v_a.start_at, v_p.upgrade_to)
            = (extract(epoch from v_a.end_at - v_a.start_at) / 60)::integer then
    update public.appointments
    set mode = v_p.upgrade_to,
        fee_amount = (fee_snapshot ->> v_p.upgrade_to::text)::bigint,
        amount_paid = amount_paid + v_p.amount
    where id = v_a.id;
    perform public.notify_appointment_parties(v_a.id, 'appointment_upgraded',
      'Consultation upgraded', 'The consultation type was changed to ' || v_p.upgrade_to::text || '.');
    return 'upgraded';
  end if;

  -- Paid but cannot be honoured: record the money and refund it in full.
  update public.appointments set amount_paid = amount_paid + v_p.amount where id = v_a.id;
  perform public.create_refunds(v_a.id, v_p.amount, 'Automatic refund: booking could not be completed', null);
  perform public.notify_admins('finance.manage', 'payment-refund-required:' || p_payment::text,
    'Automatic refund queued', 'A payment arrived for a booking that could no longer be honoured.',
    '/admin/finance');
  perform public.enqueue_notification(v_a.patient_id, 'payment_refund_queued',
    'refund-queued:' || p_payment::text, public.appointment_email_payload(v_a.id),
    'Refund on its way', 'We could not complete your booking, so your payment will be refunded in full.',
    public.appointment_link('patient', v_a.id));
  return 'refund_required';
end;
$$;

create function public.fail_payment(p_payment uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_records set status = 'failed', failure_reason = left(p_reason, 500)
  where id = p_payment and status = 'pending'
$$;

-- ---------------------------------------------------------------------------
-- Earnings
-- ---------------------------------------------------------------------------
create function public.post_consultation_earning(p_appointment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_gross bigint;
  v_split record;
begin
  select * into v_a from public.appointments where id = p_appointment;
  if v_a.status <> 'completed' then
    return;
  end if;
  v_gross := v_a.amount_paid - public.refunded_total(p_appointment);
  if v_gross <= 0 then
    return;
  end if;
  select * into v_split from public.split_commission(v_gross, v_a.commission_bps);
  if v_split.net <= 0 then
    return;
  end if;
  insert into public.financial_ledger_entries (
    doctor_id, entry_type, currency, amount, gross_amount, commission_amount, appointment_id, description
  ) values (
    v_a.doctor_id, 'consultation_earning', v_a.currency, v_split.net, v_gross, v_split.commission,
    v_a.id, 'Consultation ' || v_a.reference
  ) on conflict do nothing;
end;
$$;

-- Called by the payment webhook / refund processor (service role).
create function public.complete_refund(
  p_refund uuid,
  p_success boolean,
  p_provider_refund_id text default null,
  p_failure text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.refunds;
  v_a public.appointments;
  v_split record;
  v_refunded bigint;
begin
  select * into v_r from public.refunds where id = p_refund for update;
  if not found or v_r.status <> 'pending' then
    return; -- idempotent
  end if;

  if not p_success then
    update public.refunds set status = 'failed', failure_reason = left(p_failure, 500), processed_at = now(),
      provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id)
    where id = p_refund;
    perform public.notify_admins('finance.manage', 'refund-failed:' || p_refund::text,
      'Refund failed', 'A refund could not be processed by the payment provider.', '/admin/finance');
    return;
  end if;

  update public.refunds set status = 'succeeded', processed_at = now(),
    provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id)
  where id = p_refund;

  update public.payment_records
  set amount_refunded = amount_refunded + v_r.amount,
      status = case when amount_refunded + v_r.amount >= amount then 'refunded'::public.payment_status
                    else 'partially_refunded'::public.payment_status end
  where id = v_r.payment_id;

  select * into v_a from public.appointments where id = v_r.appointment_id for update;

  -- Doctor already credited: reverse the doctor's share of this refund.
  if exists (select 1 from public.financial_ledger_entries
             where appointment_id = v_a.id and entry_type = 'consultation_earning') then
    select * into v_split from public.split_commission(v_r.amount, v_a.commission_bps);
    if v_split.net > 0 then
      insert into public.financial_ledger_entries (
        doctor_id, entry_type, currency, amount, gross_amount, commission_amount, appointment_id, refund_id, description
      ) values (
        v_a.doctor_id, 'refund_reversal', v_r.currency, -v_split.net, -v_r.amount, -v_split.commission,
        v_a.id, v_r.id, 'Refund on ' || v_a.reference
      ) on conflict do nothing;
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_refunded from public.refunds
  where appointment_id = v_a.id and status = 'succeeded';
  if v_refunded >= v_a.amount_paid and v_a.status in ('cancelled', 'no_show', 'completed') then
    update public.appointments set status = 'refunded' where id = v_a.id;
  end if;

  perform public.enqueue_notification(v_a.patient_id, 'refund_processed', 'refund:' || p_refund::text,
    public.appointment_email_payload(v_a.id) || jsonb_build_object('amount', v_r.amount, 'currency', v_r.currency),
    'Refund processed', 'Your refund has been processed.', public.appointment_link('patient', v_a.id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------
create function public.cancel_appointment(p_appointment uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a public.appointments;
  v_actor text;
  v_policy jsonb := coalesce(public.setting('cancellation'), '{}'::jsonb);
  v_hours numeric;
  v_pct integer;
  v_refundable bigint;
  v_refund bigint := 0;
begin
  select * into v_a from public.appointments where id = p_appointment for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_uid = v_a.patient_id then
    v_actor := 'patient';
  elsif v_uid = v_a.doctor_id then
    v_actor := 'doctor';
  elsif public.has_permission('appointments.manage') then
    v_actor := 'admin';
  else
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not (v_a.status in ('pending_payment', 'confirmed') or (v_a.status = 'in_progress' and v_actor = 'admin')) then
    raise exception 'CANNOT_CANCEL: appointment is %', v_a.status using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  if v_actor = 'patient' then
    v_hours := extract(epoch from (v_a.start_at - now())) / 3600;
    v_pct := case
      when v_hours >= coalesce((v_policy ->> 'full_refund_hours_before')::numeric, 24) then 100
      when v_hours >= coalesce((v_policy ->> 'partial_refund_hours_before')::numeric, 4)
        then coalesce((v_policy ->> 'partial_refund_percent')::integer, 50)
      else 0
    end;
  else
    v_pct := 100; -- doctor- or platform-initiated cancellations are refunded in full
  end if;

  update public.appointments
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
      cancellation_reason = left(trim(p_reason), 1000)
  where id = p_appointment;

  update public.appointment_change_requests set status = 'withdrawn', decided_at = now()
  where appointment_id = p_appointment and status = 'pending';

  v_refundable := v_a.amount_paid - public.refunded_total(p_appointment);
  if v_refundable > 0 and v_pct > 0 then
    v_refund := public.create_refunds(p_appointment, (v_refundable * v_pct) / 100,
      'Cancellation by ' || v_actor, v_uid);
  end if;

  perform public.notify_appointment_parties(p_appointment, 'appointment_cancelled',
    'Appointment cancelled',
    case when v_refund > 0 then 'The appointment was cancelled. A refund has been initiated.'
         else 'The appointment was cancelled.' end);
  perform public.audit('appointment.cancel', 'appointment', p_appointment::text,
    jsonb_build_object('actor', v_actor, 'refund_amount', v_refund, 'refund_percent', v_pct));

  return jsonb_build_object('refund_amount', v_refund, 'refund_percent', v_pct, 'currency', v_a.currency);
end;
$$;

create function public.admin_refund(p_appointment uuid, p_amount bigint, p_reason text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_refundable bigint;
  v_created bigint;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_a from public.appointments where id = p_appointment for update;
  if not found or v_a.status not in ('completed', 'cancelled', 'no_show', 'in_progress') then
    raise exception 'REFUND_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  v_refundable := v_a.amount_paid - public.refunded_total(p_appointment);
  if p_amount <= 0 or p_amount > v_refundable then
    raise exception 'INVALID_AMOUNT: refundable amount is %', v_refundable using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  v_created := public.create_refunds(p_appointment, p_amount, p_reason, auth.uid());
  perform public.audit('payment.refund', 'appointment', p_appointment::text,
    jsonb_build_object('amount', v_created, 'currency', v_a.currency));
  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rescheduling (patient requests, admin decides; slot revalidated on approval)
-- ---------------------------------------------------------------------------
create function public.request_reschedule(p_appointment uuid, p_new_start timestamptz, p_reason text)
returns public.appointment_change_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_slot integer;
  v_req public.appointment_change_requests;
begin
  select * into v_a from public.appointments where id = p_appointment for update;
  if not found or v_a.patient_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_a.status <> 'confirmed' or v_a.start_at <= now() then
    raise exception 'RESCHEDULE_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.appointment_change_requests
             where appointment_id = p_appointment and status = 'pending') then
    raise exception 'REQUEST_ALREADY_PENDING' using errcode = 'P0001';
  end if;
  if p_new_start = v_a.start_at then
    raise exception 'SAME_SLOT' using errcode = 'P0001';
  end if;

  v_slot := public.assert_slot_bookable(v_a.doctor_id, p_new_start, v_a.mode, p_appointment);

  insert into public.appointment_change_requests (appointment_id, requested_by, proposed_start_at, proposed_end_at, reason)
  values (p_appointment, auth.uid(), p_new_start, p_new_start + make_interval(mins => v_slot), left(p_reason, 1000))
  returning * into v_req;

  perform public.notify_admins('appointments.manage', 'change-request:' || v_req.id::text,
    'Reschedule request', 'A patient requested a new time for appointment ' || v_a.reference || '.',
    '/admin/appointments/change-requests');
  perform public.enqueue_notification(v_a.patient_id, 'reschedule_requested',
    'reschedule-requested:' || v_req.id::text,
    public.appointment_email_payload(p_appointment)
      || jsonb_build_object('proposed_start_at', p_new_start, 'recipient_timezone', v_a.patient_timezone),
    'Reschedule request received', 'Your original appointment stays booked until the request is approved.',
    public.appointment_link('patient', p_appointment));
  return v_req;
end;
$$;

create function public.withdraw_change_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.appointment_change_requests r
  set status = 'withdrawn', decided_at = now()
  from public.appointments a
  where r.id = p_request and r.status = 'pending' and a.id = r.appointment_id and a.patient_id = auth.uid();
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

create function public.decide_change_request(p_request uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.appointment_change_requests;
  v_a public.appointments;
  v_slot integer;
begin
  if not public.has_permission('appointments.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_r from public.appointment_change_requests where id = p_request for update;
  if not found or v_r.status <> 'pending' then
    raise exception 'REQUEST_NOT_PENDING' using errcode = 'P0001';
  end if;
  select * into v_a from public.appointments where id = v_r.appointment_id for update;

  if p_approve then
    if v_a.status <> 'confirmed' then
      raise exception 'APPOINTMENT_NOT_CONFIRMED' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('book:' || v_a.doctor_id::text, 0));
    v_slot := public.assert_slot_bookable(v_a.doctor_id, v_r.proposed_start_at, v_a.mode, v_a.id);
    begin
      update public.appointments
      set start_at = v_r.proposed_start_at,
          end_at = v_r.proposed_start_at + make_interval(mins => v_slot),
          reschedule_count = reschedule_count + 1
      where id = v_a.id;
    exception when exclusion_violation then
      raise exception 'SLOT_TAKEN' using errcode = 'P0001';
    end;
    update public.appointment_change_requests
    set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 1000)
    where id = p_request;
    perform public.notify_appointment_parties(v_a.id, 'reschedule_approved',
      'Appointment rescheduled', 'The appointment has moved to a new time.');
  else
    update public.appointment_change_requests
    set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 1000)
    where id = p_request;
    perform public.enqueue_notification(v_a.patient_id, 'reschedule_rejected', 'reschedule-rejected:' || p_request::text,
      public.appointment_email_payload(v_a.id) || jsonb_build_object('recipient_timezone', v_a.patient_timezone),
      'Reschedule request declined', 'Your original appointment time is unchanged.',
      public.appointment_link('patient', v_a.id));
  end if;
  perform public.audit(case when p_approve then 'appointment.reschedule.approve' else 'appointment.reschedule.reject' end,
    'appointment', v_a.id::text, jsonb_build_object('request_id', p_request));
end;
$$;

-- ---------------------------------------------------------------------------
-- Consultation lifecycle
-- ---------------------------------------------------------------------------
create function public.join_consultation(p_appointment uuid)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_cfg jsonb := coalesce(public.setting('consultation'), '{}'::jsonb);
  v_open integer := coalesce((v_cfg ->> 'join_open_minutes_before')::integer, 10);
  v_close integer := coalesce((v_cfg ->> 'join_close_minutes_after')::integer, 30);
  v_is_doctor boolean;
begin
  select * into v_a from public.appointments where id = p_appointment for update;
  if not found or auth.uid() not in (v_a.patient_id, v_a.doctor_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_a.status not in ('confirmed', 'in_progress') then
    raise exception 'CONSULTATION_NOT_AVAILABLE: appointment is %', v_a.status using errcode = 'P0001';
  end if;
  if now() < v_a.start_at - make_interval(mins => v_open) then
    raise exception 'CONSULTATION_TOO_EARLY' using errcode = 'P0001';
  end if;
  if v_a.status = 'confirmed' and now() > v_a.end_at + make_interval(mins => v_close) then
    raise exception 'CONSULTATION_WINDOW_CLOSED' using errcode = 'P0001';
  end if;

  v_is_doctor := auth.uid() = v_a.doctor_id;
  insert into public.consultations (appointment_id) values (p_appointment) on conflict do nothing;
  update public.consultations
  set doctor_joined_at = case when v_is_doctor then coalesce(doctor_joined_at, now()) else doctor_joined_at end,
      patient_joined_at = case when not v_is_doctor then coalesce(patient_joined_at, now()) else patient_joined_at end,
      last_activity_at = now()
  where appointment_id = p_appointment;

  -- The consultation starts when the doctor joins.
  if v_is_doctor and v_a.status = 'confirmed' then
    update public.appointments set status = 'in_progress' where id = p_appointment returning * into v_a;
    update public.consultations set started_at = coalesce(started_at, now()) where appointment_id = p_appointment;
  end if;
  return v_a;
end;
$$;

create function public.complete_consultation(p_appointment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
begin
  select * into v_a from public.appointments where id = p_appointment for update;
  if not found or v_a.doctor_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_a.status <> 'in_progress' then
    raise exception 'CONSULTATION_NOT_IN_PROGRESS' using errcode = 'P0001';
  end if;
  update public.appointments set status = 'completed' where id = p_appointment;
  update public.consultations set ended_at = now(), ended_by = auth.uid() where appointment_id = p_appointment;
  perform public.post_consultation_earning(p_appointment);
  perform public.notify_appointment_parties(p_appointment, 'consultation_completed',
    'Consultation completed', 'Your consultation has been marked as completed.');
end;
$$;

create function public.mark_messages_read(p_appointment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.consultation_messages m
  set read_at = now()
  where m.appointment_id = p_appointment
    and m.read_at is null
    and m.sender_id <> auth.uid()
    and public.is_appointment_participant(p_appointment)
$$;

-- Cron (service role): expire holds, settle no-shows, close forgotten sessions.
create function public.sweep_appointments()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := coalesce(public.setting('consultation'), '{}'::jsonb);
  v_grace integer := coalesce((v_cfg ->> 'no_show_grace_minutes')::integer, 15);
  v_expired integer;
  v_no_show integer := 0;
  v_doctor_absent integer := 0;
  v_closed integer := 0;
  v_a record;
begin
  update public.appointments set status = 'expired'
  where status = 'pending_payment' and payment_expires_at < now();
  get diagnostics v_expired = row_count;

  for v_a in
    select a.*, c.patient_joined_at, c.doctor_joined_at
    from public.appointments a
    left join public.consultations c on c.appointment_id = a.id
    where a.status = 'confirmed' and a.end_at + make_interval(mins => v_grace) < now()
    for update of a
  loop
    if v_a.patient_joined_at is not null and v_a.doctor_joined_at is null then
      -- Doctor did not attend: cancel and refund the patient in full.
      update public.appointments set status = 'cancelled', cancelled_at = now(),
        cancellation_reason = 'Doctor did not join the consultation'
      where id = v_a.id;
      perform public.create_refunds(v_a.id, v_a.amount_paid - public.refunded_total(v_a.id),
        'Doctor did not join', null);
      perform public.notify_admins('appointments.manage', 'doctor-absent:' || v_a.id::text,
        'Doctor missed a consultation', 'Appointment ' || v_a.reference || ' was cancelled and refunded.',
        '/admin/appointments/' || v_a.id::text);
      v_doctor_absent := v_doctor_absent + 1;
    else
      update public.appointments set status = 'no_show' where id = v_a.id;
      v_no_show := v_no_show + 1;
    end if;
  end loop;

  -- Sessions left open long after their slot are completed so earnings are not lost.
  for v_a in
    select id from public.appointments
    where status = 'in_progress' and end_at + interval '3 hours' < now()
    for update
  loop
    update public.appointments set status = 'completed' where id = v_a.id;
    update public.consultations set ended_at = coalesce(ended_at, now()) where appointment_id = v_a.id;
    perform public.post_consultation_earning(v_a.id);
    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object('expired', v_expired, 'no_show', v_no_show,
    'doctor_absent', v_doctor_absent, 'auto_completed', v_closed);
end;
$$;

create function public.enqueue_due_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a record;
  v_count integer := 0;
  v_kind text;
begin
  for v_a in
    select id, start_at from public.appointments
    where status = 'confirmed' and start_at > now() and start_at <= now() + interval '24 hours'
  loop
    v_kind := case when v_a.start_at <= now() + interval '1 hour' then 'reminder_1h' else 'reminder_24h' end;
    if not exists (select 1 from public.notifications where dedupe_key like v_kind || ':' || v_a.id::text || ':%') then
      perform public.notify_appointment_parties(v_a.id, v_kind, 'Upcoming consultation',
        case when v_kind = 'reminder_1h' then 'Your consultation starts within the hour.'
             else 'Your consultation is within the next 24 hours.' end);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Doctor onboarding
-- ---------------------------------------------------------------------------
create function public.set_doctor_specialties(p_specialty_ids uuid[], p_primary uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_app_role() is distinct from 'doctor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if cardinality(p_specialty_ids) = 0 or cardinality(p_specialty_ids) > 5 then
    raise exception 'INVALID_SPECIALTIES: choose between 1 and 5' using errcode = 'P0001';
  end if;
  if p_primary is null or not (p_primary = any (p_specialty_ids)) then
    raise exception 'INVALID_PRIMARY_SPECIALTY' using errcode = 'P0001';
  end if;
  delete from public.doctor_specialties where doctor_id = auth.uid();
  insert into public.doctor_specialties (doctor_id, specialty_id, is_primary)
  select auth.uid(), s.id, s.id = p_primary
  from public.specialties s where s.id = any (p_specialty_ids) and s.is_active;
end;
$$;

create function public.register_credential_upload(
  p_kind public.credential_kind,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns public.doctor_credentials
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.doctor_credentials;
  v_ext text;
begin
  if public.current_app_role() is distinct from 'doctor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'INVALID_FILE_TYPE' using errcode = 'P0001';
  end if;
  if p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'FILE_TOO_LARGE' using errcode = 'P0001';
  end if;
  v_ext := case p_mime_type when 'application/pdf' then 'pdf' when 'image/png' then 'png' else 'jpg' end;
  insert into public.doctor_credentials (doctor_id, kind, storage_path, file_name, mime_type, size_bytes)
  values (auth.uid(), p_kind, auth.uid()::text || '/' || gen_random_uuid()::text || '.' || v_ext,
          left(p_file_name, 255), p_mime_type, p_size_bytes)
  returning * into v_row;
  return v_row;
end;
$$;

create function public.submit_doctor_application()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.doctor_profiles;
  v_missing text[] := '{}';
begin
  select * into v_d from public.doctor_profiles where user_id = auth.uid() for update;
  if not found then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_d.application_status not in ('draft', 'info_required') then
    raise exception 'APPLICATION_NOT_EDITABLE: status is %', v_d.application_status using errcode = 'P0001';
  end if;

  if coalesce(trim(v_d.display_name), '') = '' then v_missing := array_append(v_missing, 'display_name'); end if;
  if coalesce(trim(v_d.qualifications), '') = '' then v_missing := array_append(v_missing, 'qualifications'); end if;
  if coalesce(trim(v_d.registration_number), '') = '' then v_missing := array_append(v_missing, 'registration_number'); end if;
  if v_d.registration_country is null then v_missing := array_append(v_missing, 'registration_country'); end if;
  if v_d.fee_chat is null and v_d.fee_audio is null and v_d.fee_video is null then v_missing := array_append(v_missing, 'fees'); end if;
  if v_d.terms_accepted_at is null then v_missing := array_append(v_missing, 'terms'); end if;
  if not exists (select 1 from public.doctor_specialties where doctor_id = v_d.user_id) then
    v_missing := array_append(v_missing, 'specialty');
  end if;
  if not exists (select 1 from public.doctor_credentials where doctor_id = v_d.user_id and kind = 'registration_certificate') then
    v_missing := array_append(v_missing, 'registration_certificate');
  end if;
  if not exists (select 1 from public.doctor_credentials where doctor_id = v_d.user_id and kind = 'identity_document') then
    v_missing := array_append(v_missing, 'identity_document');
  end if;
  if cardinality(v_missing) > 0 then
    raise exception 'APPLICATION_INCOMPLETE: %', array_to_string(v_missing, ',') using errcode = 'P0001';
  end if;

  update public.doctor_profiles set application_status = 'submitted', submitted_at = now() where user_id = v_d.user_id;
  insert into public.doctor_application_events (doctor_id, from_status, to_status, actor_id)
  values (v_d.user_id, v_d.application_status, 'submitted', auth.uid());
  perform public.notify_admins('doctors.manage', 'doctor-application:' || v_d.user_id::text || ':' || now()::text,
    'New doctor application', v_d.display_name || ' submitted an application.', '/admin/doctors/' || v_d.user_id::text);
  perform public.enqueue_notification(v_d.user_id, 'doctor_application_submitted',
    'doctor-submitted:' || v_d.user_id::text || ':' || now()::text,
    jsonb_build_object('doctor_name', v_d.display_name),
    'Application submitted', 'We will review your application and documents.', '/doctor/onboarding');
end;
$$;

create function public.review_doctor_application(p_doctor uuid, p_action text, p_note text default null)
returns public.doctor_application_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d public.doctor_profiles;
  v_to public.doctor_application_status;
begin
  if not public.has_permission('doctors.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_d from public.doctor_profiles where user_id = p_doctor for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  v_to := case
    when p_action = 'start_review' and v_d.application_status = 'submitted' then 'under_review'
    when p_action = 'request_info' and v_d.application_status in ('submitted', 'under_review') then 'info_required'
    when p_action = 'approve' and v_d.application_status in ('submitted', 'under_review') then 'approved'
    when p_action = 'reject' and v_d.application_status in ('submitted', 'under_review', 'info_required') then 'rejected'
    when p_action = 'suspend' and v_d.application_status = 'approved' then 'suspended'
    when p_action = 'reinstate' and v_d.application_status = 'suspended' then 'approved'
  end::public.doctor_application_status;
  if v_to is null then
    raise exception 'INVALID_TRANSITION: % from %', p_action, v_d.application_status using errcode = 'P0001';
  end if;
  if p_action in ('request_info', 'reject', 'suspend') and coalesce(trim(p_note), '') = '' then
    raise exception 'NOTE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_action = 'approve' and exists (
    select 1 from public.doctor_credentials
    where doctor_id = p_doctor and kind in ('registration_certificate', 'identity_document') and status <> 'verified'
  ) then
    raise exception 'CREDENTIALS_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  update public.doctor_profiles
  set application_status = v_to,
      approved_at = case when v_to = 'approved' then coalesce(approved_at, now()) else approved_at end
  where user_id = p_doctor;
  insert into public.doctor_application_events (doctor_id, from_status, to_status, actor_id, note)
  values (p_doctor, v_d.application_status, v_to, auth.uid(), left(p_note, 2000));

  perform public.enqueue_notification(p_doctor, 'doctor_application_' || v_to::text,
    'doctor-review:' || p_doctor::text || ':' || v_to::text || ':' || now()::text,
    jsonb_build_object('doctor_name', v_d.display_name, 'status', v_to, 'note', p_note),
    case v_to
      when 'approved' then 'Your profile is approved'
      when 'info_required' then 'More information needed'
      when 'rejected' then 'Application not approved'
      when 'suspended' then 'Account suspended'
      else 'Application update' end,
    p_note, '/doctor/onboarding');
  perform public.audit('doctor.' || p_action, 'doctor', p_doctor::text,
    jsonb_build_object('from', v_d.application_status, 'to', v_to));
  return v_to;
end;
$$;

create function public.review_doctor_credential(p_credential uuid, p_status public.verification_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('doctors.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status = 'rejected' and coalesce(trim(p_note), '') = '' then
    raise exception 'NOTE_REQUIRED' using errcode = 'P0001';
  end if;
  update public.doctor_credentials
  set status = p_status, review_note = left(p_note, 2000), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_credential;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public.audit('doctor.credential.review', 'doctor_credential', p_credential::text,
    jsonb_build_object('status', p_status));
end;
$$;

create function public.set_user_active(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  select role into v_role from public.profiles where id = p_user;
  if v_role is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if not ((v_role = 'patient' and public.has_permission('patients.manage'))
       or (v_role = 'doctor' and public.has_permission('doctors.manage'))
       or (v_role = 'admin' and public.has_permission('*'))) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'CANNOT_DEACTIVATE_SELF' using errcode = 'P0001';
  end if;
  update public.profiles set is_active = p_active where id = p_user;
  perform public.audit(case when p_active then 'user.activate' else 'user.deactivate' end, 'profile', p_user::text, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Medical documents
-- ---------------------------------------------------------------------------
create function public.register_document_upload(
  p_title text,
  p_category public.document_category,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_appointment uuid default null
)
returns public.medical_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.medical_documents;
  v_max bigint := coalesce((public.setting('uploads') ->> 'max_file_mb')::bigint, 10) * 1048576;
  v_ext text;
begin
  if public.current_app_role() is distinct from 'patient' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_appointment is not null and not exists (
    select 1 from public.appointments where id = p_appointment and patient_id = auth.uid()
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_size_bytes <= 0 or p_size_bytes > least(v_max, 26214400) then
    raise exception 'FILE_TOO_LARGE' using errcode = 'P0001';
  end if;
  v_ext := case p_mime_type
    when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' when 'image/heic' then 'heic' end;
  if v_ext is null then
    raise exception 'INVALID_FILE_TYPE' using errcode = 'P0001';
  end if;
  -- The object name is random; titles and file names never appear in storage paths or URLs.
  insert into public.medical_documents (patient_id, appointment_id, uploaded_by, category, title,
    storage_path, file_name, mime_type, size_bytes)
  values (auth.uid(), p_appointment, auth.uid(), p_category, left(trim(p_title), 200),
    auth.uid()::text || '/' || gen_random_uuid()::text || '.' || v_ext, left(p_file_name, 255), p_mime_type, p_size_bytes)
  returning * into v_row;
  return v_row;
end;
$$;

create function public.confirm_document_upload(p_document uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.medical_documents set status = 'available'
  where id = p_document and patient_id = auth.uid() and status = 'pending'
$$;

create function public.delete_medical_document(p_document uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  update public.medical_documents set status = 'deleted', deleted_at = now()
  where id = p_document and patient_id = auth.uid() and status <> 'deleted'
  returning storage_path into v_path;
  if v_path is null then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public.audit('document.delete', 'medical_document', p_document::text, '{}');
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clinical access grants
-- ---------------------------------------------------------------------------
create function public.share_records_with_doctor(p_doctor uuid, p_reason text, p_days integer default 90)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if public.current_app_role() is distinct from 'patient' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.is_approved_doctor(p_doctor) then
    raise exception 'DOCTOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.clinical_access_grants (patient_id, doctor_id, source, reason, granted_by, expires_at)
  values (auth.uid(), p_doctor, 'patient_share', left(trim(p_reason), 1000), auth.uid(),
          now() + make_interval(days => greatest(1, least(p_days, 365))))
  returning id into v_id;
  perform public.audit('clinical_access.grant', 'patient', auth.uid()::text,
    jsonb_build_object('doctor_id', p_doctor, 'source', 'patient_share'));
  return v_id;
end;
$$;

create function public.admin_grant_clinical_access(p_patient uuid, p_doctor uuid, p_reason text, p_days integer default 30)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.has_permission('clinical.read') and public.has_permission('patients.manage')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.is_approved_doctor(p_doctor) then
    raise exception 'DOCTOR_NOT_FOUND' using errcode = 'P0001';
  end if;
  insert into public.clinical_access_grants (patient_id, doctor_id, source, reason, granted_by, expires_at)
  values (p_patient, p_doctor, 'admin_referral', left(trim(p_reason), 1000), auth.uid(),
          now() + make_interval(days => greatest(1, least(p_days, 365))))
  returning id into v_id;
  perform public.audit('clinical_access.grant', 'patient', p_patient::text,
    jsonb_build_object('doctor_id', p_doctor, 'source', 'admin_referral'));
  perform public.enqueue_notification(p_patient, null, 'clinical-referral:' || v_id::text, null,
    'Records shared for referral', 'Your records were shared with a referred doctor. You can revoke this in Settings.',
    '/patient/sharing');
  return v_id;
end;
$$;

create function public.revoke_clinical_access(p_grant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.clinical_access_grants
  set revoked_at = now(), revoked_by = auth.uid()
  where id = p_grant and revoked_at is null
    and (patient_id = auth.uid() or public.has_permission('clinical.read'));
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public.audit('clinical_access.revoke', 'clinical_access_grant', p_grant::text, '{}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Prescriptions
-- ---------------------------------------------------------------------------
create function public.create_prescription_draft(p_appointment uuid)
returns public.prescriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_rx public.prescriptions;
begin
  select * into v_a from public.appointments where id = p_appointment;
  if not found or v_a.doctor_id is distinct from auth.uid() or not public.is_approved_doctor() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_a.status not in ('in_progress', 'completed') then
    raise exception 'PRESCRIPTION_NOT_ALLOWED: appointment is %', v_a.status using errcode = 'P0001';
  end if;
  select * into v_rx from public.prescriptions where appointment_id = p_appointment and status = 'draft';
  if found then
    return v_rx;
  end if;
  if exists (select 1 from public.prescriptions where appointment_id = p_appointment and status = 'final') then
    raise exception 'PRESCRIPTION_ALREADY_FINAL: use amend' using errcode = 'P0001';
  end if;
  insert into public.prescriptions (appointment_id, patient_id, doctor_id, version)
  values (p_appointment, v_a.patient_id, v_a.doctor_id,
          coalesce((select max(version) from public.prescriptions where appointment_id = p_appointment), 0) + 1)
  returning * into v_rx;
  return v_rx;
end;
$$;

create function public.finalize_prescription(p_prescription uuid)
returns public.prescriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rx public.prescriptions;
  v_doctor jsonb;
  v_patient jsonb;
  v_items jsonb;
  v_appt public.appointments;
begin
  select * into v_rx from public.prescriptions where id = p_prescription for update;
  if not found or v_rx.doctor_id is distinct from auth.uid() or not public.is_approved_doctor() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_rx.status <> 'draft' then
    raise exception 'PRESCRIPTION_NOT_DRAFT' using errcode = 'P0001';
  end if;
  if coalesce(trim(v_rx.diagnosis), '') = '' then
    raise exception 'DIAGNOSIS_REQUIRED' using errcode = 'P0001';
  end if;
  if v_rx.version > 1 and coalesce(trim(v_rx.amendment_reason), '') = '' then
    raise exception 'AMENDMENT_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_appt from public.appointments where id = v_rx.appointment_id;

  select jsonb_build_object(
    'name', trim(d.title || ' ' || d.display_name), 'qualifications', d.qualifications,
    'registration_number', d.registration_number, 'registration_council', d.registration_council,
    'registration_country', d.registration_country, 'email', p.email)
  into v_doctor
  from public.doctor_profiles d join public.profiles p on p.id = d.user_id where d.user_id = v_rx.doctor_id;

  select jsonb_build_object('name', p.full_name, 'date_of_birth', pp.date_of_birth, 'sex', pp.sex,
    'consultation_date', v_appt.start_at, 'consultation_mode', v_appt.mode, 'reference', v_appt.reference)
  into v_patient
  from public.profiles p join public.patient_profiles pp on pp.user_id = p.id where p.id = v_rx.patient_id;

  select coalesce(jsonb_agg(to_jsonb(i) - 'id' - 'prescription_id' order by i.position), '[]'::jsonb)
  into v_items from public.prescription_items i where i.prescription_id = p_prescription;

  -- Supersede the previous final version first (only one final per appointment).
  if v_rx.supersedes_id is not null then
    update public.prescriptions set status = 'superseded' where id = v_rx.supersedes_id and status = 'final';
  end if;

  update public.prescriptions
  set status = 'final',
      finalized_at = now(),
      doctor_snapshot = v_doctor,
      patient_snapshot = v_patient,
      content_hash = encode(sha256(convert_to(
        jsonb_build_object(
          'appointment_id', v_rx.appointment_id, 'version', v_rx.version,
          'presenting_symptoms', v_rx.presenting_symptoms, 'clinical_observations', v_rx.clinical_observations,
          'relevant_history', v_rx.relevant_history, 'diagnosis', v_rx.diagnosis,
          'treatment_plan', v_rx.treatment_plan, 'advice', v_rx.advice, 'follow_up', v_rx.follow_up,
          'items', v_items, 'doctor', v_doctor, 'patient', v_patient
        )::text, 'UTF8')), 'hex')
  where id = p_prescription
  returning * into v_rx;

  perform public.enqueue_notification(v_rx.patient_id, 'prescription_available',
    'prescription:' || v_rx.id::text,
    public.appointment_email_payload(v_rx.appointment_id) || jsonb_build_object('recipient_timezone', v_appt.patient_timezone),
    'Prescription available', 'Your doctor has issued a prescription.', '/patient/prescriptions/' || v_rx.id::text);
  perform public.audit('prescription.finalize', 'prescription', v_rx.id::text,
    jsonb_build_object('version', v_rx.version, 'appointment_id', v_rx.appointment_id));
  return v_rx;
end;
$$;

create function public.amend_prescription(p_prescription uuid, p_reason text)
returns public.prescriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.prescriptions;
  v_new public.prescriptions;
begin
  select * into v_old from public.prescriptions where id = p_prescription;
  if not found or v_old.doctor_id is distinct from auth.uid() or not public.is_approved_doctor() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_old.status <> 'final' then
    raise exception 'PRESCRIPTION_NOT_FINAL' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'AMENDMENT_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.prescriptions where appointment_id = v_old.appointment_id and status = 'draft') then
    raise exception 'AMENDMENT_ALREADY_IN_PROGRESS' using errcode = 'P0001';
  end if;

  insert into public.prescriptions (
    appointment_id, patient_id, doctor_id, version, supersedes_id, presenting_symptoms, clinical_observations,
    relevant_history, diagnosis, treatment_plan, advice, follow_up, amendment_reason
  ) values (
    v_old.appointment_id, v_old.patient_id, v_old.doctor_id, v_old.version + 1, v_old.id, v_old.presenting_symptoms,
    v_old.clinical_observations, v_old.relevant_history, v_old.diagnosis, v_old.treatment_plan, v_old.advice,
    v_old.follow_up, left(trim(p_reason), 1000)
  ) returning * into v_new;

  insert into public.prescription_items (prescription_id, position, medication_name, strength, dosage_form, dose,
    route, frequency, duration, instructions)
  select v_new.id, position, medication_name, strength, dosage_form, dose, route, frequency, duration, instructions
  from public.prescription_items where prescription_id = v_old.id;
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finance administration
-- ---------------------------------------------------------------------------
create function public.set_commission_rule(p_doctor uuid, p_rate_bps integer, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.commission_rules (doctor_id, rate_bps, note, created_by)
  values (p_doctor, p_rate_bps, left(p_note, 500), auth.uid())
  returning id into v_id;
  perform public.audit('commission.set', 'commission_rule', v_id::text,
    jsonb_build_object('doctor_id', p_doctor, 'rate_bps', p_rate_bps));
  return v_id;
end;
$$;

create function public.add_ledger_adjustment(p_doctor uuid, p_currency text, p_amount bigint, p_description text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(trim(p_description), '') = '' then
    raise exception 'DESCRIPTION_REQUIRED' using errcode = 'P0001';
  end if;
  insert into public.financial_ledger_entries (doctor_id, entry_type, currency, amount, description, created_by)
  values (p_doctor, 'adjustment', upper(p_currency), p_amount, left(p_description, 500), auth.uid())
  returning id into v_id;
  perform public.audit('ledger.adjust', 'doctor', p_doctor::text,
    jsonb_build_object('amount', p_amount, 'currency', upper(p_currency), 'entry_id', v_id));
  return v_id;
end;
$$;

-- Idempotent: one batch per (date, currency). Each unsettled ledger entry up to the cutoff
-- is attached to exactly one payout (payout_items.ledger_entry_id is unique).
create function public.create_settlement_batch(p_settlement_date date, p_currency text, p_cutoff timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
  v_doc record;
  v_payout uuid;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_cutoff > now() then
    raise exception 'CUTOFF_IN_FUTURE' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('settlement:' || upper(p_currency), 0));

  select id into v_batch from public.payout_batches
  where settlement_date = p_settlement_date and currency = upper(p_currency);
  if found then
    return v_batch;
  end if;

  insert into public.payout_batches (settlement_date, currency, cutoff_at, created_by)
  values (p_settlement_date, upper(p_currency), p_cutoff, auth.uid())
  returning id into v_batch;

  for v_doc in
    select l.doctor_id, sum(l.amount) as total
    from public.financial_ledger_entries l
    left join public.payout_items pi on pi.ledger_entry_id = l.id
    where l.currency = upper(p_currency) and l.entry_type <> 'payout'
      and l.created_at <= p_cutoff and pi.ledger_entry_id is null
    group by l.doctor_id
    having sum(l.amount) > 0
  loop
    insert into public.doctor_payouts (batch_id, doctor_id, currency, amount, created_by)
    values (v_batch, v_doc.doctor_id, upper(p_currency), v_doc.total, auth.uid())
    returning id into v_payout;
    insert into public.payout_items (payout_id, ledger_entry_id)
    select v_payout, l.id
    from public.financial_ledger_entries l
    left join public.payout_items pi on pi.ledger_entry_id = l.id
    where l.doctor_id = v_doc.doctor_id and l.currency = upper(p_currency) and l.entry_type <> 'payout'
      and l.created_at <= p_cutoff and pi.ledger_entry_id is null;
  end loop;

  perform public.audit('settlement.create', 'payout_batch', v_batch::text,
    jsonb_build_object('date', p_settlement_date, 'currency', upper(p_currency)));
  return v_batch;
end;
$$;

create function public.update_payout_status(
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

create function public.update_platform_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('settings.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.platform_settings set value = p_value, updated_by = auth.uid(), updated_at = now() where key = p_key;
  if not found then
    raise exception 'UNKNOWN_SETTING' using errcode = 'P0001';
  end if;
  perform public.audit('settings.update', 'platform_setting', p_key, jsonb_build_object('value', p_value));
end;
$$;
