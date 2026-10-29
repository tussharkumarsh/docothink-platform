-- ============================================================================
-- DEVELOPMENT SEED DATA ONLY. Never run against production.
-- Every account below uses the password: DevPassword123
-- ============================================================================

do $$
declare
  v_users jsonb := '[
    {"id": "00000000-0000-4000-8000-000000000001", "email": "admin@docothink.test",   "name": "Platform Admin",   "role": null,     "tz": "Europe/London"},
    {"id": "00000000-0000-4000-8000-000000000101", "email": "dr.mehta@docothink.test", "name": "Anjali Mehta",     "role": "doctor", "tz": "Asia/Kolkata"},
    {"id": "00000000-0000-4000-8000-000000000102", "email": "dr.clarke@docothink.test","name": "James Clarke",     "role": "doctor", "tz": "Europe/London"},
    {"id": "00000000-0000-4000-8000-000000000103", "email": "dr.rivera@docothink.test","name": "Sofia Rivera",     "role": "doctor", "tz": "America/New_York"},
    {"id": "00000000-0000-4000-8000-000000000201", "email": "emily@docothink.test",    "name": "Emily Carter",     "role": null,     "tz": "America/New_York"},
    {"id": "00000000-0000-4000-8000-000000000202", "email": "oliver@docothink.test",   "name": "Oliver Bennett",   "role": null,     "tz": "Europe/London"}
  ]';
  v_u jsonb;
begin
  for v_u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', (v_u ->> 'id')::uuid, 'authenticated', 'authenticated',
      v_u ->> 'email', extensions.crypt('DevPassword123', extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}',
      jsonb_strip_nulls(jsonb_build_object('full_name', v_u ->> 'name', 'signup_role', v_u ->> 'role', 'timezone', v_u ->> 'tz')),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), (v_u ->> 'id')::uuid, v_u ->> 'id',
      jsonb_build_object('sub', v_u ->> 'id', 'email', v_u ->> 'email', 'email_verified', true),
      'email', now(), now(), now()
    ) on conflict do nothing;
  end loop;
end;
$$;

-- Admin with all permissions.
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000001';
insert into public.admin_permissions (user_id, permission)
values ('00000000-0000-4000-8000-000000000001', '*')
on conflict do nothing;

-- Approved doctors.
update public.doctor_profiles d set
  display_name = v.name, headline = v.headline, bio = v.bio, qualifications = v.quals,
  years_experience = v.years, languages = v.langs, country = v.country, currency = v.currency,
  fee_chat = v.fee_chat, fee_audio = v.fee_audio, fee_video = v.fee_video,
  registration_number = v.reg, registration_council = v.council, registration_country = v.country,
  education = v.education, application_status = 'approved', approved_at = now(), submitted_at = now(),
  terms_accepted_at = now(), terms_version = '2026-10', booking_horizon_days = 14, min_notice_minutes = 60
from (values
  ('00000000-0000-4000-8000-000000000101'::uuid, 'Anjali Mehta', 'Consultant Dermatologist',
   'Treats acne, eczema, psoriasis, hair loss and pigmentation, with a focus on clear follow-up plans.',
   'MBBS, MD (Dermatology)', 12, array['English', 'Hindi'], 'IN', 'INR', 50000::bigint, 80000::bigint, 100000::bigint,
   'DMC-48213', 'Delhi Medical Council',
   '[{"degree": "MBBS", "institution": "Maulana Azad Medical College", "year": 2010}, {"degree": "MD Dermatology", "institution": "AIIMS New Delhi", "year": 2014}]'::jsonb),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'James Clarke', 'General Practitioner',
   'Experienced NHS GP offering advice on everyday illnesses, long-term conditions and referrals.',
   'MBChB, MRCGP', 15, array['English'], 'GB', 'GBP', 2500::bigint, 3500::bigint, 4500::bigint,
   'GMC-7012345', 'General Medical Council',
   '[{"degree": "MBChB", "institution": "University of Manchester", "year": 2009}]'::jsonb),
  ('00000000-0000-4000-8000-000000000103'::uuid, 'Sofia Rivera', 'Board-certified Cardiologist',
   'Preventive cardiology, blood pressure and cholesterol management, and second opinions.',
   'MD, FACC', 18, array['English', 'Spanish'], 'US', 'USD', null::bigint, 6000::bigint, 9000::bigint,
   'NY-293847', 'New York State Board of Medicine',
   '[{"degree": "MD", "institution": "Columbia University", "year": 2006}]'::jsonb)
) as v (id, name, headline, bio, quals, years, langs, country, currency, fee_chat, fee_audio, fee_video, reg, council, education)
where d.user_id = v.id;

insert into public.doctor_specialties (doctor_id, specialty_id, is_primary)
select v.doctor_id, s.id, v.is_primary
from (values
  ('00000000-0000-4000-8000-000000000101'::uuid, 'dermatology', true),
  ('00000000-0000-4000-8000-000000000101'::uuid, 'cosmetology', false),
  ('00000000-0000-4000-8000-000000000102'::uuid, 'general-medicine', true),
  ('00000000-0000-4000-8000-000000000103'::uuid, 'cardiology', true)
) as v (doctor_id, slug, is_primary)
join public.specialties s on s.slug = v.slug
on conflict do nothing;

-- Weekly schedules in each doctor's own zone.
-- Dr Mehta: Mon–Sat 18:00–22:00 IST (US morning / UK afternoon). Dr Clarke: Mon–Fri 09:00–12:00 London.
-- Dr Rivera: Mon/Wed/Fri 08:00–11:00 New York, audio/video only.
insert into public.doctor_availability_rules (doctor_id, weekday, start_time, end_time, timezone, slot_minutes, buffer_minutes, modes)
select '00000000-0000-4000-8000-000000000101'::uuid, d, '18:00'::time, '22:00'::time, 'Asia/Kolkata', 20, 10,
       array['chat', 'audio', 'video']::public.consultation_mode[]
from generate_series(1, 6) d
union all
select '00000000-0000-4000-8000-000000000102'::uuid, d, '09:00'::time, '12:00'::time, 'Europe/London', 15, 5,
       array['chat', 'audio', 'video']::public.consultation_mode[]
from generate_series(1, 5) d
union all
select '00000000-0000-4000-8000-000000000103'::uuid, d, '08:00'::time, '11:00'::time, 'America/New_York', 30, 0,
       array['audio', 'video']::public.consultation_mode[]
from unnest(array[1, 3, 5]) d;

-- Demo patient details.
update public.profiles set country = 'US', phone = '+1 212 555 0101' where id = '00000000-0000-4000-8000-000000000201';
update public.profiles set country = 'GB', phone = '+44 20 7946 0102' where id = '00000000-0000-4000-8000-000000000202';
update public.patient_profiles set date_of_birth = '1990-04-12', sex = 'female', city = 'New York', country = 'US'
where user_id = '00000000-0000-4000-8000-000000000201';
update public.patient_profiles set date_of_birth = '1985-09-30', sex = 'male', city = 'London', country = 'GB'
where user_id = '00000000-0000-4000-8000-000000000202';
