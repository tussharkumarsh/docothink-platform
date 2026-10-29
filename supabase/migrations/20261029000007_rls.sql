-- Row Level Security, column grants and function permissions.
-- Principle: clients read through policies; sensitive writes only via RPCs (no UPDATE/DELETE policies).

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.patient_profiles enable row level security;
alter table public.patient_medical_profiles enable row level security;
alter table public.currencies enable row level security;
alter table public.specialties enable row level security;
alter table public.conditions enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.doctor_specialties enable row level security;
alter table public.doctor_credentials enable row level security;
alter table public.doctor_application_events enable row level security;
alter table public.doctor_fee_history enable row level security;
alter table public.platform_settings enable row level security;
alter table public.commission_rules enable row level security;
alter table public.doctor_availability_rules enable row level security;
alter table public.doctor_availability_exceptions enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_intakes enable row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_change_requests enable row level security;
alter table public.consultations enable row level security;
alter table public.consultation_messages enable row level security;
alter table public.clinical_access_grants enable row level security;
alter table public.medical_documents enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.payment_records enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.refunds enable row level security;
alter table public.financial_ledger_entries enable row level security;
alter table public.payout_batches enable row level security;
alter table public.doctor_payouts enable row level security;
alter table public.payout_items enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limit_buckets enable row level security;

-- ---------------------------------------------------------------------------
-- Table privileges. Start from nothing for client roles, then grant what policies may use.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.currencies, public.specialties, public.conditions, public.doctor_profiles,
  public.doctor_specialties, public.doctor_availability_rules, public.platform_settings to anon;

grant select on all tables in schema public to authenticated;
revoke select on public.email_outbox, public.payment_webhook_events, public.rate_limit_buckets from authenticated;

-- Column-limited updates: users can never touch role, status, money or audit columns.
grant update (full_name, phone, timezone, country, preferred_language) on public.profiles to authenticated;
grant update (date_of_birth, sex, address_line1, address_line2, city, region, postal_code, country,
  emergency_contact_name, emergency_contact_relationship, emergency_contact_phone)
  on public.patient_profiles to authenticated;
grant update (data, completed_sections) on public.patient_medical_profiles to authenticated;
grant update (title, display_name, headline, bio, qualifications, years_experience, languages, country, timezone,
  currency, fee_chat, fee_audio, fee_video, registration_number, registration_council, registration_country,
  education, experience, photo_path, is_accepting_bookings, booking_horizon_days, min_notice_minutes,
  terms_accepted_at, terms_version)
  on public.doctor_profiles to authenticated;
grant insert, update, delete on public.doctor_availability_rules to authenticated;
grant insert, delete on public.doctor_availability_exceptions to authenticated;
grant insert on public.consultation_messages to authenticated;
grant update (reason_for_visit, symptoms_duration, specialty_answers) on public.appointment_intakes to authenticated;
grant update (presenting_symptoms, clinical_observations, relevant_history, diagnosis, treatment_plan, advice,
  follow_up, amendment_reason) on public.prescriptions to authenticated;
grant delete on public.prescriptions to authenticated;
grant insert, update, delete on public.prescription_items to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.doctor_credentials to authenticated;
grant insert, update on public.specialties, public.conditions to authenticated;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.is_admin()
  or (role = 'patient' and public.doctor_has_clinical_access(auth.uid(), id))
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy admin_permissions_select on public.admin_permissions for select to authenticated
  using (user_id = auth.uid() or public.has_permission('*'));

create policy patient_profiles_select on public.patient_profiles for select to authenticated using (
  user_id = auth.uid()
  or public.has_permission('patients.manage')
  or public.doctor_has_clinical_access(auth.uid(), user_id)
);
create policy patient_profiles_update_own on public.patient_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy medical_profiles_select on public.patient_medical_profiles for select to authenticated
  using (public.can_read_patient_clinical(patient_id));
create policy medical_profiles_update_own on public.patient_medical_profiles for update to authenticated
  using (patient_id = auth.uid()) with check (patient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create policy currencies_read on public.currencies for select to anon, authenticated using (true);

-- Separate anon policies: anon cannot execute has_permission(), and OR is not guaranteed to short-circuit.
create policy specialties_public on public.specialties for select to anon using (is_active);
create policy specialties_read on public.specialties for select to authenticated
  using (is_active or public.has_permission('settings.manage'));
create policy specialties_admin_insert on public.specialties for insert to authenticated
  with check (public.has_permission('settings.manage'));
create policy specialties_admin_update on public.specialties for update to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

create policy conditions_public on public.conditions for select to anon using (is_active);
create policy conditions_read on public.conditions for select to authenticated
  using (is_active or public.has_permission('settings.manage'));
create policy conditions_admin_insert on public.conditions for insert to authenticated
  with check (public.has_permission('settings.manage'));
create policy conditions_admin_update on public.conditions for update to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

create policy platform_settings_read on public.platform_settings for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Doctors
-- ---------------------------------------------------------------------------
create policy doctor_profiles_public on public.doctor_profiles for select to anon
  using (application_status = 'approved');
create policy doctor_profiles_select on public.doctor_profiles for select to authenticated using (
  application_status = 'approved' or user_id = auth.uid() or public.is_admin()
);
create policy doctor_profiles_update_own on public.doctor_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy doctor_specialties_public on public.doctor_specialties for select to anon using (
  exists (select 1 from public.doctor_profiles d where d.user_id = doctor_id and d.application_status = 'approved')
);
create policy doctor_specialties_select on public.doctor_specialties for select to authenticated using (
  doctor_id = auth.uid() or public.is_admin()
  or exists (select 1 from public.doctor_profiles d where d.user_id = doctor_id and d.application_status = 'approved')
);

create policy doctor_credentials_select on public.doctor_credentials for select to authenticated
  using (doctor_id = auth.uid() or public.has_permission('doctors.manage'));
create policy doctor_credentials_delete_own on public.doctor_credentials for delete to authenticated using (
  doctor_id = auth.uid() and status = 'pending'
  and exists (select 1 from public.doctor_profiles d where d.user_id = doctor_id
              and d.application_status in ('draft', 'info_required'))
);

create policy doctor_application_events_select on public.doctor_application_events for select to authenticated
  using (doctor_id = auth.uid() or public.has_permission('doctors.manage'));

create policy doctor_fee_history_select on public.doctor_fee_history for select to authenticated
  using (doctor_id = auth.uid() or public.has_permission('finance.manage') or public.has_permission('doctors.manage'));

create policy commission_rules_select on public.commission_rules for select to authenticated using (
  public.has_permission('finance.manage') or doctor_id = auth.uid()
  or (doctor_id is null and public.current_app_role() = 'doctor')
);

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------
create policy availability_rules_public on public.doctor_availability_rules for select to anon using (
  is_active and exists (select 1 from public.doctor_profiles d where d.user_id = doctor_id and d.application_status = 'approved')
);
create policy availability_rules_select on public.doctor_availability_rules for select to authenticated using (
  doctor_id = auth.uid() or public.is_admin()
  or (is_active and exists (select 1 from public.doctor_profiles d where d.user_id = doctor_id and d.application_status = 'approved'))
);
create policy availability_rules_insert_own on public.doctor_availability_rules for insert to authenticated
  with check (doctor_id = auth.uid() and public.current_app_role() = 'doctor');
create policy availability_rules_update_own on public.doctor_availability_rules for update to authenticated
  using (doctor_id = auth.uid()) with check (doctor_id = auth.uid());
create policy availability_rules_delete_own on public.doctor_availability_rules for delete to authenticated
  using (doctor_id = auth.uid());

create policy availability_exceptions_select on public.doctor_availability_exceptions for select to authenticated
  using (doctor_id = auth.uid() or public.has_permission('appointments.manage'));
create policy availability_exceptions_insert_own on public.doctor_availability_exceptions for insert to authenticated
  with check (doctor_id = auth.uid() and public.current_app_role() = 'doctor');
create policy availability_exceptions_delete_own on public.doctor_availability_exceptions for delete to authenticated
  using (doctor_id = auth.uid());

create policy appointments_select on public.appointments for select to authenticated using (
  patient_id = auth.uid() or doctor_id = auth.uid()
  or public.has_permission('appointments.manage') or public.has_permission('finance.manage')
  or public.has_permission('patients.manage')
);

create policy appointment_intakes_select on public.appointment_intakes for select to authenticated using (
  exists (select 1 from public.appointments a where a.id = appointment_id
          and (a.patient_id = auth.uid() or a.doctor_id = auth.uid()))
  or public.has_permission('clinical.read')
);
create policy appointment_intakes_update_own on public.appointment_intakes for update to authenticated using (
  exists (select 1 from public.appointments a where a.id = appointment_id
          and a.patient_id = auth.uid() and a.status in ('pending_payment', 'confirmed'))
) with check (
  exists (select 1 from public.appointments a where a.id = appointment_id and a.patient_id = auth.uid())
);

create policy appointment_events_select on public.appointment_events for select to authenticated using (
  exists (select 1 from public.appointments a where a.id = appointment_id
          and (a.patient_id = auth.uid() or a.doctor_id = auth.uid()))
  or public.has_permission('appointments.manage')
);

create policy change_requests_select on public.appointment_change_requests for select to authenticated using (
  exists (select 1 from public.appointments a where a.id = appointment_id
          and (a.patient_id = auth.uid() or a.doctor_id = auth.uid()))
  or public.has_permission('appointments.manage')
);

-- ---------------------------------------------------------------------------
-- Clinical
-- ---------------------------------------------------------------------------
create policy consultations_select on public.consultations for select to authenticated
  using (public.is_appointment_participant(appointment_id) or public.has_permission('appointments.manage'));

create policy messages_select on public.consultation_messages for select to authenticated
  using (public.is_appointment_participant(appointment_id) or public.has_permission('clinical.read'));
create policy messages_insert on public.consultation_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.can_post_message(appointment_id) and read_at is null);

create policy access_grants_select on public.clinical_access_grants for select to authenticated using (
  patient_id = auth.uid() or doctor_id = auth.uid() or public.has_permission('clinical.read')
);

create policy documents_select on public.medical_documents for select to authenticated
  using (status <> 'deleted' and public.can_read_patient_clinical(patient_id));

-- Drafts are visible only to their author; finalised versions follow clinical access.
create policy prescriptions_select on public.prescriptions for select to authenticated using (
  doctor_id = auth.uid()
  or (status in ('final', 'superseded') and public.can_read_patient_clinical(patient_id))
);
create policy prescriptions_update_draft on public.prescriptions for update to authenticated
  using (doctor_id = auth.uid() and status = 'draft')
  with check (doctor_id = auth.uid() and status = 'draft');
create policy prescriptions_delete_draft on public.prescriptions for delete to authenticated
  using (doctor_id = auth.uid() and status = 'draft');

create policy prescription_items_select on public.prescription_items for select to authenticated using (
  exists (select 1 from public.prescriptions p where p.id = prescription_id and (
    p.doctor_id = auth.uid()
    or (p.status in ('final', 'superseded') and public.can_read_patient_clinical(p.patient_id))
  ))
);
create policy prescription_items_write_draft on public.prescription_items for insert to authenticated with check (
  exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft')
);
create policy prescription_items_update_draft on public.prescription_items for update to authenticated using (
  exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft')
) with check (
  exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft')
);
create policy prescription_items_delete_draft on public.prescription_items for delete to authenticated using (
  exists (select 1 from public.prescriptions p where p.id = prescription_id and p.doctor_id = auth.uid() and p.status = 'draft')
);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
create policy payments_select on public.payment_records for select to authenticated
  using (patient_id = auth.uid() or public.has_permission('finance.manage'));

create policy refunds_select on public.refunds for select to authenticated using (
  exists (select 1 from public.payment_records p where p.id = payment_id and p.patient_id = auth.uid())
  or public.has_permission('finance.manage')
);

create policy ledger_select on public.financial_ledger_entries for select to authenticated
  using (doctor_id = auth.uid() or public.has_permission('finance.manage'));

create policy payout_batches_select on public.payout_batches for select to authenticated
  using (public.has_permission('finance.manage'));

create policy doctor_payouts_select on public.doctor_payouts for select to authenticated
  using (doctor_id = auth.uid() or public.has_permission('finance.manage'));

create policy payout_items_select on public.payout_items for select to authenticated using (
  exists (select 1 from public.doctor_payouts p where p.id = payout_id and p.doctor_id = auth.uid())
  or public.has_permission('finance.manage')
);

-- ---------------------------------------------------------------------------
-- Ops
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_permission('audit.read'));

-- email_outbox, payment_webhook_events, rate_limit_buckets: no policies (service role only).

-- ---------------------------------------------------------------------------
-- Function permissions. Supabase grants EXECUTE broadly by default; lock it down.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Policy helpers (evaluated inside RLS for signed-in users).
grant execute on function
  public.is_valid_timezone(text),
  public.minutes_of_day(time),
  public.current_app_role(),
  public.is_admin(),
  public.has_permission(text),
  public.is_approved_doctor(uuid),
  public.doctor_has_clinical_access(uuid, uuid),
  public.can_read_patient_clinical(uuid),
  public.is_appointment_participant(uuid),
  public.can_post_message(uuid),
  public.setting(text),
  public.effective_commission_bps(uuid, timestamptz),
  public.split_commission(bigint, integer)
to authenticated;
grant execute on function public.is_valid_timezone(text), public.minutes_of_day(time), public.setting(text) to anon;

-- Public slot generation (times only).
grant execute on function public.get_doctor_busy_intervals(uuid, timestamptz, timestamptz) to anon, authenticated;

-- User-callable operations (each authorises internally).
grant execute on function
  public.book_appointment(uuid, timestamptz, public.consultation_mode, text, text, text),
  public.create_payment_record(uuid, text, public.consultation_mode, text),
  public.cancel_appointment(uuid, text),
  public.admin_refund(uuid, bigint, text),
  public.request_reschedule(uuid, timestamptz, text),
  public.withdraw_change_request(uuid),
  public.decide_change_request(uuid, boolean, text),
  public.join_consultation(uuid),
  public.complete_consultation(uuid),
  public.mark_messages_read(uuid),
  public.set_doctor_specialties(uuid[], uuid),
  public.register_credential_upload(public.credential_kind, text, text, bigint),
  public.submit_doctor_application(),
  public.review_doctor_application(uuid, text, text),
  public.review_doctor_credential(uuid, public.verification_status, text),
  public.set_user_active(uuid, boolean),
  public.register_document_upload(text, public.document_category, text, text, bigint, uuid),
  public.confirm_document_upload(uuid),
  public.delete_medical_document(uuid),
  public.share_records_with_doctor(uuid, text, integer),
  public.admin_grant_clinical_access(uuid, uuid, text, integer),
  public.revoke_clinical_access(uuid),
  public.create_prescription_draft(uuid),
  public.finalize_prescription(uuid),
  public.amend_prescription(uuid, text),
  public.set_commission_rule(uuid, integer, text),
  public.add_ledger_adjustment(uuid, text, bigint, text),
  public.create_settlement_batch(date, text, timestamptz),
  public.update_payout_status(uuid, public.payout_status, text, text, text),
  public.update_platform_setting(text, jsonb)
to authenticated;

-- Service-role only (webhooks, cron, server internals). service_role bypasses RLS but still needs EXECUTE.
grant execute on all functions in schema public to service_role;
