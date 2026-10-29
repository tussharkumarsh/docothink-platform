-- Storage buckets and policies, Realtime authorisation, production reference data.

-- ---------------------------------------------------------------------------
-- Storage. Medical documents and credentials are private; the app issues
-- short-lived signed URLs after its own authorisation check (and audit log).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('medical-documents', 'medical-documents', false, 26214400,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('doctor-credentials', 'doctor-credentials', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png']),
  ('avatars', 'avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- No client policies on private buckets: uploads use server-issued signed upload URLs,
-- downloads use server-issued signed URLs. Only avatars are client-writable (own folder).
create policy avatars_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
-- postgres_changes honours RLS for each subscriber.
alter publication supabase_realtime add table public.consultation_messages;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.notifications;

-- Private Broadcast/Presence channels "consult:<appointment_id>" carry WebRTC signalling.
-- Only the appointment's patient and doctor may join, and only while it is live.
create function public.can_use_consult_channel(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_topic is null or p_topic not like 'consult:%' then
    return false;
  end if;
  begin
    v_id := substr(p_topic, 9)::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  return exists (
    select 1 from public.appointments a
    where a.id = v_id
      and auth.uid() in (a.patient_id, a.doctor_id)
      and a.status in ('confirmed', 'in_progress')
  );
end;
$$;
grant execute on function public.can_use_consult_channel(text) to authenticated;

create policy consult_channel_receive on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence')
         and public.can_use_consult_channel(realtime.topic()));
create policy consult_channel_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence')
              and public.can_use_consult_channel(realtime.topic()));

-- ---------------------------------------------------------------------------
-- Reference data needed in every environment (admins can edit afterwards).
-- Specialty and condition names come from the legacy Docothink website.
-- ---------------------------------------------------------------------------
insert into public.currencies (code, name, symbol, minor_units) values
  ('INR', 'Indian rupee', '₹', 2),
  ('USD', 'US dollar', '$', 2),
  ('GBP', 'Pound sterling', '£', 2)
on conflict (code) do nothing;

insert into public.specialties (slug, name, description, icon_path, sort_order) values
  ('general-medicine', 'General Medicine', 'Everyday illnesses, check-ups and first opinions.', '/specialties/general-medicine.png', 10),
  ('dermatology', 'Dermatology', 'Skin, hair and nail conditions.', '/specialties/dermatology.png', 20),
  ('cardiology', 'Cardiology', 'Heart health, blood pressure and circulation.', '/specialties/cardiology.png', 30),
  ('ophthalmology', 'Ophthalmology', 'Eye health and vision problems.', '/specialties/ophthalmology.png', 40),
  ('orthopedics', 'Orthopedics', 'Bones, joints, muscles and sports injuries.', '/specialties/orthopedics.png', 50),
  ('pediatrics', 'Pediatrics', 'Health care for infants, children and teenagers.', '/specialties/pediatrics.png', 60),
  ('gynaecology', 'Gynaecology', 'Women''s reproductive health, periods and PCOS.', '/specialties/gynaecology.png', 70),
  ('obstetrics', 'Obstetrics', 'Pregnancy care before and after birth.', '/specialties/obstetrics.png', 80),
  ('ent', 'ENT', 'Ear, nose and throat conditions.', '/specialties/ent.png', 90),
  ('dentistry', 'Dentistry', 'Teeth, gums and oral health advice.', '/specialties/dentistry.png', 100),
  ('psychiatry', 'Psychiatry & Mental Health', 'Anxiety, depression, sleep and emotional wellbeing.', '/specialties/psychiatry.png', 110),
  ('neurology', 'Neurology', 'Headaches, nerves, brain and spine.', '/specialties/neurology.png', 120),
  ('gastroenterology', 'Gastroenterology', 'Digestion, stomach, liver and bowel.', '/specialties/gastroenterology.png', 130),
  ('pulmonology', 'Pulmonology', 'Lungs, breathing and asthma.', '/specialties/pulmonology.png', 140),
  ('endocrinology', 'Endocrinology', 'Hormones and thyroid.', '/specialties/endocrinology.png', 150),
  ('diabetology', 'Diabetology', 'Diabetes care and blood sugar management.', '/specialties/diabetology.png', 160),
  ('urology', 'Urology', 'Urinary tract and male reproductive health.', '/specialties/urology.png', 170),
  ('nephrology', 'Nephrology', 'Kidney health.', '/specialties/nephrology.png', 180),
  ('rheumatology', 'Rheumatology', 'Arthritis and autoimmune conditions.', '/specialties/rheumatology.png', 190),
  ('allergy-immunology', 'Allergy & Immunology', 'Allergies and immune system disorders.', '/specialties/allergy-immunology.png', 200),
  ('infectious-diseases', 'Infectious Diseases', 'Infections, fevers and travel medicine.', '/specialties/infectious-diseases.png', 210),
  ('hiv-aids', 'HIV/AIDS Care', 'Confidential HIV testing advice and long-term care.', '/specialties/hiv-aids.png', 220),
  ('dietetics-nutrition', 'Dietetics & Nutrition', 'Diet plans, weight management and nutrition.', '/specialties/dietetics-nutrition.png', 230),
  ('sexual-health', 'Sexual Health', 'Confidential sexual health and sexology consultations.', '/specialties/sexual-health.png', 240),
  ('cosmetology', 'Cosmetology', 'Cosmetic skin and hair concerns.', '/specialties/cosmetology.png', 250)
on conflict (slug) do nothing;

insert into public.conditions (slug, name, specialty_id, sort_order)
select c.slug, c.name, s.id, c.sort_order
from (values
  ('covid-19', 'Covid-19', 'infectious-diseases', 10),
  ('pcod-period-troubles', 'PCOD / Period troubles', 'gynaecology', 20),
  ('blood-pressure', 'Blood Pressure', 'cardiology', 30),
  ('heartburn', 'Heartburn', 'gastroenterology', 40),
  ('diabetes', 'Diabetes', 'diabetology', 50),
  ('pregnancy', 'Pregnancy', 'obstetrics', 60),
  ('erectile-dysfunction', 'Erectile dysfunction', 'sexual-health', 70),
  ('fear-of-hiv', 'Fear of HIV', 'hiv-aids', 80),
  ('depression', 'Depression', 'psychiatry', 90),
  ('anxiety', 'Anxiety', 'psychiatry', 95),
  ('insomnia', 'Insomnia', 'psychiatry', 96),
  ('obesity', 'Obesity', 'dietetics-nutrition', 100),
  ('piles', 'Piles', 'gastroenterology', 110),
  ('asthma', 'Asthma', 'pulmonology', 120),
  ('vaginal-discharge', 'Vaginal discharge', 'gynaecology', 130),
  ('hair-loss', 'Hair loss', 'dermatology', 140),
  ('weight-loss', 'Weight loss', 'dietetics-nutrition', 150),
  ('vomiting', 'Vomiting', 'general-medicine', 160),
  ('root-canal', 'Root canal', 'dentistry', 170),
  ('acne', 'Acne', 'dermatology', 180),
  ('thyroid', 'Thyroid problems', 'endocrinology', 190),
  ('back-pain', 'Back pain', 'orthopedics', 200)
) as c (slug, name, specialty_slug, sort_order)
join public.specialties s on s.slug = c.specialty_slug
on conflict (slug) do nothing;

insert into public.platform_settings (key, value) values
  ('booking', '{"max_horizon_days": 30, "payment_hold_minutes": 15}'),
  ('consultation', '{"join_open_minutes_before": 10, "join_close_minutes_after": 30, "no_show_grace_minutes": 15}'),
  ('cancellation', '{"full_refund_hours_before": 24, "partial_refund_hours_before": 4, "partial_refund_percent": 50}'),
  ('uploads', '{"max_file_mb": 10}'),
  ('branding', '{"name": "Docothink", "support_email": "support@docothink.com", "emergency_note": "In an emergency call 911 (US), 999 (UK) or 112 (India) immediately."}'),
  ('display', '{"admin_timezone": "UTC"}')
on conflict (key) do nothing;

-- Platform default commission: 10%.
insert into public.commission_rules (doctor_id, rate_bps, note, effective_from)
select null, 1000, 'Platform default commission (10%)', '2000-01-01T00:00:00Z'
where not exists (select 1 from public.commission_rules where doctor_id is null);
