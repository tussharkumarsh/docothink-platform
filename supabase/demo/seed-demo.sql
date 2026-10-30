-- ============================================================================
-- DEMO DATA: about 64 fictional doctors, 240 fictional patients, ~600 appointments with payments,
-- earnings, prescriptions and reviews. Every account is on the reserved, undeliverable
-- demo.docothink.test domain and flagged is_demo. Remove it all with supabase/demo/cleanup-demo.sql.
--
--   npx supabase db query --linked -f supabase/demo/seed-demo.sql
--
-- Refuses to run twice. Returns the showcase logins (3 doctors, 3 patients) as its last result.
-- ============================================================================

drop table if exists demo_showcase;
create temp table demo_showcase (role text, email text, password text) on commit preserve rows;

do $$
declare
  -- Specialty → reference content (topic for review text, reasons, diagnoses, medicines "name|strength|frequency|duration").
  v_spec jsonb := $j$[
    {"slug":"general-medicine","n":4,"topic":"my fever and fatigue","reasons":["Fever and body ache for three days","Persistent tiredness and low energy"],"dx":["Viral fever","Iron deficiency (suspected)"],"meds":["Paracetamol|500 mg|Every 6 hours if needed|3 days","Oral rehydration salts|1 sachet|Twice daily|3 days"]},
    {"slug":"dermatology","n":4,"topic":"my skin concerns","reasons":["Acne on face and back","Itchy red patches on arms"],"dx":["Acne vulgaris","Atopic dermatitis"],"meds":["Adapalene gel|0.1%|Once at night|8 weeks","Moisturising emollient|—|Twice daily|Ongoing"]},
    {"slug":"cardiology","n":3,"topic":"my blood pressure readings","reasons":["High blood pressure readings at home","Occasional palpitations"],"dx":["Stage 1 hypertension","Benign palpitations"],"meds":["Amlodipine|5 mg|Once daily|4 weeks"]},
    {"slug":"ophthalmology","n":2,"topic":"my eye irritation","reasons":["Red, watery eyes","Blurred vision when reading"],"dx":["Allergic conjunctivitis","Presbyopia"],"meds":["Lubricating eye drops|—|Four times daily|2 weeks"]},
    {"slug":"orthopedics","n":3,"topic":"my knee pain","reasons":["Knee pain when climbing stairs","Lower back pain after lifting"],"dx":["Patellofemoral pain","Mechanical low back pain"],"meds":["Ibuprofen|400 mg|Three times daily after food|5 days"]},
    {"slug":"pediatrics","n":3,"topic":"my child's cough","reasons":["Child with cough and runny nose","Toddler with mild fever"],"dx":["Upper respiratory tract infection","Viral fever"],"meds":["Paracetamol syrup|120 mg/5 ml|Every 6 hours if needed|3 days"]},
    {"slug":"gynaecology","n":4,"topic":"my period problems","reasons":["Irregular periods","Painful periods"],"dx":["Polycystic ovary syndrome (suspected)","Primary dysmenorrhoea"],"meds":["Mefenamic acid|500 mg|Three times daily during periods|3 days"]},
    {"slug":"obstetrics","n":2,"topic":"my pregnancy questions","reasons":["Early pregnancy questions","Nausea in first trimester"],"dx":["Normal early pregnancy","Nausea of pregnancy"],"meds":["Folic acid|400 mcg|Once daily|12 weeks"]},
    {"slug":"ent","n":3,"topic":"my sinus problems","reasons":["Blocked nose and facial pressure","Ear pain after a cold"],"dx":["Acute sinusitis","Otitis media"],"meds":["Saline nasal spray|—|Three times daily|1 week"]},
    {"slug":"dentistry","n":3,"topic":"my toothache","reasons":["Toothache on the lower left side","Bleeding gums when brushing"],"dx":["Dental caries","Gingivitis"],"meds":["Chlorhexidine mouthwash|0.2%|Twice daily|1 week"]},
    {"slug":"psychiatry","n":4,"topic":"my anxiety","reasons":["Feeling anxious most days","Trouble sleeping and low mood"],"dx":["Generalised anxiety","Insomnia"],"meds":["Sertraline|50 mg|Once daily|4 weeks"]},
    {"slug":"neurology","n":2,"topic":"my headaches","reasons":["Recurring headaches","Tingling in hands"],"dx":["Migraine without aura","Mild carpal tunnel syndrome"],"meds":["Sumatriptan|50 mg|At onset of migraine|As needed"]},
    {"slug":"gastroenterology","n":2,"topic":"my stomach issues","reasons":["Acidity and heartburn","Bloating after meals"],"dx":["Gastro-oesophageal reflux","Functional dyspepsia"],"meds":["Pantoprazole|40 mg|Once daily before breakfast|4 weeks"]},
    {"slug":"pulmonology","n":2,"topic":"my breathing","reasons":["Wheezing at night","Cough lasting three weeks"],"dx":["Mild asthma","Post-viral cough"],"meds":["Salbutamol inhaler|100 mcg|2 puffs when needed|Ongoing"]},
    {"slug":"endocrinology","n":2,"topic":"my thyroid results","reasons":["Thyroid test results review","Weight gain and tiredness"],"dx":["Subclinical hypothyroidism","Hypothyroidism"],"meds":["Levothyroxine|25 mcg|Once daily on empty stomach|6 weeks"]},
    {"slug":"diabetology","n":3,"topic":"my sugar levels","reasons":["High fasting sugar readings","Diabetes medication review"],"dx":["Type 2 diabetes","Prediabetes"],"meds":["Metformin|500 mg|Twice daily with meals|12 weeks"]},
    {"slug":"urology","n":2,"topic":"my urinary symptoms","reasons":["Burning while passing urine","Frequent urination at night"],"dx":["Urinary tract infection","Overactive bladder"],"meds":["Nitrofurantoin|100 mg|Twice daily|5 days"]},
    {"slug":"nephrology","n":2,"topic":"my kidney test results","reasons":["Raised creatinine on blood test","Swelling in ankles"],"dx":["Chronic kidney disease stage 2","Fluid retention"],"meds":["Low-salt diet plan|—|Daily|Ongoing"]},
    {"slug":"rheumatology","n":2,"topic":"my joint pain","reasons":["Morning stiffness in hands","Painful swollen knee"],"dx":["Inflammatory arthritis (suspected)","Osteoarthritis of knee"],"meds":["Naproxen|250 mg|Twice daily after food|7 days"]},
    {"slug":"allergy-immunology","n":2,"topic":"my allergies","reasons":["Sneezing and itchy eyes every spring","Hives after eating nuts"],"dx":["Allergic rhinitis","Food allergy (suspected)"],"meds":["Cetirizine|10 mg|Once daily|2 weeks"]},
    {"slug":"infectious-diseases","n":2,"topic":"my recurring infections","reasons":["Fever after travel","Recurring infections"],"dx":["Travel-related viral illness","Recurrent cellulitis"],"meds":["Paracetamol|500 mg|Every 6 hours if needed|3 days"]},
    {"slug":"hiv-aids","n":2,"topic":"my treatment plan","reasons":["Treatment review","Questions about PrEP"],"dx":["HIV on stable treatment","PrEP counselling"],"meds":["Continue current regimen|—|As prescribed|Ongoing"]},
    {"slug":"dietetics-nutrition","n":2,"topic":"my diet plan","reasons":["Help with weight loss","Diet plan for high cholesterol"],"dx":["Overweight","Dyslipidaemia"],"meds":["Vitamin D3|1000 IU|Once daily|8 weeks"]},
    {"slug":"sexual-health","n":2,"topic":"my private concerns","reasons":["Confidential sexual health question","Screening advice"],"dx":["Counselling provided","Screening recommended"],"meds":["Screening tests advised|—|Once|—"]},
    {"slug":"cosmetology","n":2,"topic":"my hair fall","reasons":["Hair fall over six months","Pigmentation on cheeks"],"dx":["Telogen effluvium","Melasma"],"meds":["Minoxidil solution|5%|Twice daily|12 weeks"]}
  ]$j$;
  v_first jsonb := '{"IN":["Aarav","Priya","Rohan","Ananya","Vikram","Kavya","Arjun","Meera","Siddharth","Neha","Rahul","Isha","Karan","Pooja","Aditya","Sneha","Nikhil","Divya","Varun","Shreya","Manish","Ritu","Sanjay","Lakshmi"],
                    "GB":["Oliver","Charlotte","Harry","Amelia","George","Emily","Thomas","Sophie","William","Grace","James","Hannah","Edward","Lucy","Samuel","Chloe"],
                    "US":["Michael","Jessica","David","Ashley","Daniel","Sarah","Matthew","Lauren","Christopher","Megan","Andrew","Rachel","Joshua","Olivia","Ethan","Maria","Carlos","Sofia"]}';
  v_last jsonb := '{"IN":["Sharma","Iyer","Reddy","Nair","Gupta","Kapoor","Menon","Rao","Joshi","Banerjee","Desai","Kulkarni","Pillai","Chopra","Malhotra","Bhat","Sinha","Agarwal"],
                   "GB":["Thompson","Patel","Hughes","Walker","Wright","Clarke","Evans","Turner","Hall","Wood","Ahmed","Morgan","Baker","Khan"],
                   "US":["Johnson","Williams","Brown","Garcia","Miller","Davis","Martinez","Rodriguez","Wilson","Anderson","Taylor","Moore","Lee","Hernandez","Lopez"]}';
  v_good text[] := array[
    'Listened carefully and explained %s in plain language. I felt reassured.',
    'Very thorough. Took time to understand %s and gave a clear plan.',
    'Booking was easy and the call started on time. Great advice on %s.',
    'Kind and patient. Answered every question I had about %s.',
    'Clear prescription and follow-up advice. Much better than waiting weeks for a clinic visit.',
    'Professional and friendly. The video call worked smoothly.',
    'Helped me understand %s without any jargon. Highly recommended.',
    'Practical advice that actually worked. Will book again.',
    'Felt like a proper consultation, not a rushed one. Thank you, doctor.',
    'Explained the options for %s and let me decide. Very respectful.'];
  v_meh text[] := array[
    'Helpful advice, though the consultation felt a little rushed.',
    'Good doctor, but I had to wait a few minutes for the call to start.',
    'Advice was fine but I expected more detail about %s.',
    'The call dropped once, but the doctor called back and finished properly.'];

  v_countries text[] := array['IN', 'GB', 'US'];
  v_t0 timestamptz := now();
  v_s jsonb; v_i integer := 0; v_k integer; v_country text; v_cnt jsonb := '{"IN":0,"GB":0,"US":0}';
  v_id uuid; v_first_name text; v_last_name text; v_email text; v_pw text; v_tz text; v_ccy text;
  v_chat bigint; v_unit bigint; v_lang text[]; v_qual text; v_spec_name text; v_days integer[]; v_mode_set public.consultation_mode[];
  v_start_hour integer; v_slot integer; v_buf integer; v_d integer;
  v_patients uuid[] := '{}'; v_ptz text[] := '{}';
  v_doc record; v_rule record; v_day date; v_today date; v_n integer; v_idx integer; v_start timestamptz; v_end timestamptz;
  v_modes public.consultation_mode[]; v_mode public.consultation_mode; v_fee bigint; v_comm integer;
  v_p integer; v_patient uuid; v_status public.appointment_status; v_appt uuid; v_try integer; v_r double precision;
  v_rx uuid; v_med text; v_parts text[]; v_rating smallint; v_comment text; v_ref text; v_doctor_snap jsonb; v_patient_snap jsonb;
  v_refund record;
begin
  if exists (select 1 from public.profiles where is_demo) then
    raise exception 'DEMO_ALREADY_SEEDED: remove it first with supabase/demo/cleanup-demo.sql';
  end if;
  perform setseed(0.42);

  -- ---------------------------------------------------------------- doctors
  for v_s in select * from jsonb_array_elements(v_spec) loop
    v_spec_name := null;
    select name into v_spec_name from public.specialties where slug = v_s ->> 'slug';
    continue when v_spec_name is null;
    for v_k in 1 .. (v_s ->> 'n')::integer loop
      v_i := v_i + 1;
      v_country := v_countries[1 + (v_i % 3)];
      v_cnt := jsonb_set(v_cnt, array[v_country], to_jsonb((v_cnt ->> v_country)::integer + 1));
      v_n := (v_cnt ->> v_country)::integer;
      v_first_name := v_first -> v_country ->> ((v_n * 5) % jsonb_array_length(v_first -> v_country));
      v_last_name := v_last -> v_country ->> ((v_n * 7) % jsonb_array_length(v_last -> v_country));
      v_email := 'dr.' || lower(v_first_name) || '.' || lower(v_last_name) || v_i || '@demo.docothink.test';
      v_tz := case v_country when 'IN' then 'Asia/Kolkata' when 'GB' then 'Europe/London' else 'America/New_York' end;
      v_ccy := case v_country when 'IN' then 'INR' when 'GB' then 'GBP' else 'USD' end;
      v_pw := 'Demo' || translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'xyz') || '7';
      v_id := gen_random_uuid();

      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
        extensions.crypt(v_pw, extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('full_name', v_first_name || ' ' || v_last_name, 'signup_role', 'doctor', 'timezone', v_tz),
        now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());

      -- Fees in minor units, rounded to 50 rupees / 1 pound / 1 dollar.
      v_unit := case v_ccy when 'INR' then 5000 else 100 end;
      v_chat := case v_ccy when 'INR' then 30000 + floor(random() * 7) * 5000 when 'GBP' then 2000 + floor(random() * 21) * 100
                 else 3000 + floor(random() * 41) * 100 end;
      v_mode_set := case when v_country = 'US' and random() < 0.3 then array['audio', 'video']::public.consultation_mode[]
                         else array['chat', 'audio', 'video']::public.consultation_mode[] end;
      v_lang := case v_country
        when 'IN' then array['English', 'Hindi', (array['Tamil', 'Bengali', 'Gujarati', 'Punjabi'])[1 + floor(random() * 4)::integer]]
        when 'US' then case when random() < 0.3 then array['English', 'Spanish'] else array['English'] end
        else array['English'] end;
      v_qual := case v_s ->> 'slug'
        when 'dentistry' then case v_country when 'IN' then 'BDS, MDS' when 'GB' then 'BDS, MFDS' else 'DDS' end
        when 'dietetics-nutrition' then case v_country when 'IN' then 'MSc Clinical Nutrition' when 'GB' then 'BSc Dietetics, HCPC registered' else 'MS, RDN' end
        else case v_country when 'IN' then 'MBBS, MD (' || v_spec_name || ')' when 'GB' then 'MBBS, MRCP (UK)' else 'MD, Board certified in ' || v_spec_name end
      end;

      update public.profiles set is_demo = true, country = v_country where id = v_id;
      update public.doctor_profiles set
        is_demo = true,
        headline = v_spec_name || ' specialist',
        bio = 'Demo profile: this doctor is fictional and shown for presentation only. Consults on ' || (v_s ->> 'topic') || ' and related concerns.',
        qualifications = v_qual,
        years_experience = 4 + floor(random() * 27)::integer,
        languages = v_lang, country = v_country, currency = v_ccy,
        fee_chat = case when 'chat' = any (v_mode_set) then v_chat end,
        fee_audio = round(v_chat * 1.2 / v_unit) * v_unit,
        fee_video = round(v_chat * 1.4 / v_unit) * v_unit,
        registration_number = 'DEMO-' || lpad(v_i::text, 4, '0'),
        registration_council = case v_country when 'IN' then 'National Medical Commission (demo)' when 'GB' then 'General Medical Council (demo)' else 'State Medical Board (demo)' end,
        registration_country = v_country,
        education = '[]'::jsonb,
        application_status = 'approved', approved_at = now() - interval '90 days', submitted_at = now() - interval '95 days',
        terms_accepted_at = now() - interval '95 days', terms_version = '2026-10', booking_horizon_days = 14, min_notice_minutes = 60
      where user_id = v_id;
      insert into public.doctor_specialties (doctor_id, specialty_id, is_primary)
      select v_id, id, true from public.specialties where slug = v_s ->> 'slug';

      -- 3–6 working days (Mon–Sat), one 3–4 hour window in the doctor's own zone.
      select array_agg(d) into v_days from (select d from generate_series(1, 6) d order by random() limit 3 + floor(random() * 4)::integer) x;
      v_start_hour := 8 + floor(random() * 10)::integer;
      v_slot := (array[20, 30])[1 + floor(random() * 2)::integer];
      v_buf := (array[0, 5, 10])[1 + floor(random() * 3)::integer];
      foreach v_d in array v_days loop
        insert into public.doctor_availability_rules (doctor_id, weekday, start_time, end_time, timezone, slot_minutes, buffer_minutes, modes)
        values (v_id, v_d, make_time(v_start_hour, 0, 0), make_time(v_start_hour + 3 + floor(random() * 2)::integer, 0, 0), v_tz, v_slot, v_buf, v_mode_set);
      end loop;

      if v_n = 1 then
        insert into demo_showcase values ('doctor', v_email, v_pw);
      end if;
    end loop;
  end loop;

  -- ---------------------------------------------------------------- patients
  for v_k in 1 .. 240 loop
    v_country := case when v_k % 4 in (0, 1) then 'IN' when v_k % 4 = 2 then 'GB' else 'US' end;
    v_first_name := v_first -> v_country ->> ((v_k * 3) % jsonb_array_length(v_first -> v_country));
    v_last_name := v_last -> v_country ->> ((v_k * 11) % jsonb_array_length(v_last -> v_country));
    v_email := lower(v_first_name) || '.' || lower(v_last_name) || v_k || '@demo.docothink.test';
    v_tz := case v_country when 'IN' then 'Asia/Kolkata' when 'GB' then 'Europe/London'
              else (array['America/New_York', 'America/Chicago', 'America/Los_Angeles'])[1 + v_k % 3] end;
    v_pw := 'Demo' || translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'xyz') || '7';
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
      extensions.crypt(v_pw, extensions.gen_salt('bf')), now(), '{"provider": "email", "providers": ["email"]}',
      jsonb_build_object('full_name', v_first_name || ' ' || v_last_name, 'timezone', v_tz),
      now() - make_interval(days => 60 + floor(random() * 120)::integer), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
      jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
    update public.profiles set is_demo = true, country = v_country where id = v_id;
    update public.patient_profiles set
      date_of_birth = make_date(1950 + floor(random() * 58)::integer, 1 + floor(random() * 12)::integer, 1 + floor(random() * 28)::integer),
      sex = (array['female', 'male'])[1 + v_k % 2],
      city = case v_country when 'IN' then (array['Mumbai', 'Delhi', 'Bengaluru', 'Chennai', 'Pune', 'Kolkata'])[1 + v_k % 6]
                            when 'GB' then (array['London', 'Manchester', 'Birmingham', 'Leeds', 'Bristol'])[1 + v_k % 5]
                            else (array['New York', 'Chicago', 'Los Angeles', 'Houston', 'Seattle'])[1 + v_k % 5] end,
      country = v_country
    where user_id = v_id;
    v_patients := v_patients || v_id;
    v_ptz := v_ptz || v_tz;
    if v_k <= 3 then
      insert into demo_showcase values ('patient', v_email, v_pw);
    end if;
  end loop;

  -- ---------------------------------------------------------------- appointments
  for v_doc in
    select d.user_id, d.timezone, d.currency, d.fee_chat, d.fee_audio, d.fee_video, d.title, d.display_name, d.qualifications,
           d.registration_number, d.registration_council, d.registration_country, ds.specialty_id, s.slug,
           (select e.value from jsonb_array_elements(v_spec) e where e.value ->> 'slug' = s.slug) as ref
    from public.doctor_profiles d
    join public.doctor_specialties ds on ds.doctor_id = d.user_id and ds.is_primary
    join public.specialties s on s.id = ds.specialty_id
    where d.is_demo
    order by d.registration_number
  loop
    v_comm := public.effective_commission_bps(v_doc.user_id);
    v_today := (now() at time zone v_doc.timezone)::date;
    v_doctor_snap := jsonb_build_object('name', trim(v_doc.title || ' ' || v_doc.display_name), 'qualifications', v_doc.qualifications,
      'registration_number', v_doc.registration_number, 'registration_council', v_doc.registration_council,
      'registration_country', v_doc.registration_country);
    for v_day in select g::date from generate_series(v_today - 60, v_today + 14, interval '1 day') g loop
      continue when v_day = v_today;
      for v_rule in
        select * from public.doctor_availability_rules
        where doctor_id = v_doc.user_id and weekday = extract(isodow from v_day)::integer
      loop
        continue when random() >= case when v_day < v_today then 0.2 else 0.26 end;
        v_n := ((public.minutes_of_day(v_rule.end_time) - public.minutes_of_day(v_rule.start_time) - v_rule.slot_minutes)
                / (v_rule.slot_minutes + v_rule.buffer_minutes)) + 1;
        v_idx := floor(random() * v_n)::integer;
        v_start := ((v_day + v_rule.start_time) + make_interval(mins => v_idx * (v_rule.slot_minutes + v_rule.buffer_minutes))) at time zone v_rule.timezone;
        v_end := v_start + make_interval(mins => v_rule.slot_minutes);
        select array_agg(m) into v_modes from unnest(v_rule.modes) m
        where (m = 'chat' and v_doc.fee_chat is not null) or (m = 'audio' and v_doc.fee_audio is not null) or (m = 'video' and v_doc.fee_video is not null);
        continue when v_modes is null;
        v_mode := v_modes[1 + floor(random() * array_length(v_modes, 1))::integer];
        v_fee := case v_mode when 'chat' then v_doc.fee_chat when 'audio' then v_doc.fee_audio else v_doc.fee_video end;
        v_r := random();
        v_status := case when v_day > v_today then 'confirmed' when v_r < 0.85 then 'completed' when v_r < 0.95 then 'cancelled' else 'no_show' end;

        v_appt := null;
        for v_try in 1 .. 4 loop
          v_p := 1 + floor(random() * array_length(v_patients, 1))::integer;
          v_patient := v_patients[v_p];
          begin
            insert into public.appointments (patient_id, doctor_id, specialty_id, mode, status, start_at, end_at, doctor_timezone,
              patient_timezone, currency, fee_snapshot, fee_amount, amount_paid, commission_bps, created_at,
              cancelled_at, cancelled_by, cancellation_reason)
            values (v_patient, v_doc.user_id, v_doc.specialty_id, v_mode, v_status, v_start, v_end, v_doc.timezone,
              v_ptz[v_p], v_doc.currency,
              jsonb_strip_nulls(jsonb_build_object('chat', v_doc.fee_chat, 'audio', v_doc.fee_audio, 'video', v_doc.fee_video)),
              v_fee, v_fee, v_comm, least(now(), v_start - make_interval(days => 1 + floor(random() * 10)::integer)),
              case when v_status = 'cancelled' then v_start - make_interval(hours => 26 + floor(random() * 72)::integer) end,
              case when v_status = 'cancelled' then v_patient end,
              case when v_status = 'cancelled' then 'Cancelled by patient: change of plans' end)
            returning id, reference into v_appt, v_ref;
            exit;
          exception when exclusion_violation then
            continue; -- this patient is already booked then; try another
          end;
        end loop;
        continue when v_appt is null;

        insert into public.appointment_intakes (appointment_id, reason_for_visit, symptoms_duration)
        values (v_appt, v_doc.ref -> 'reasons' ->> floor(random() * jsonb_array_length(v_doc.ref -> 'reasons'))::integer,
                (array['2 days', '1 week', '2 weeks', '1 month', '3 months'])[1 + floor(random() * 5)::integer]);
        insert into public.payment_records (appointment_id, patient_id, purpose, provider, provider_payment_id, amount, currency, status, succeeded_at, created_at)
        values (v_appt, v_patient, 'booking', 'manual', 'demo_' || v_appt, v_fee, v_doc.currency, 'succeeded',
                least(now(), v_start - interval '1 day'), least(now(), v_start - interval '1 day'));

        if v_status = 'cancelled' then
          perform public.create_refunds(v_appt, v_fee, 'Cancelled by patient', v_patient);
          for v_refund in select id from public.refunds where appointment_id = v_appt and status = 'pending' loop
            perform public.complete_refund(v_refund.id, true, 'demo_refund_' || v_refund.id, null);
          end loop;
        elsif v_status = 'no_show' then
          insert into public.consultations (appointment_id, doctor_joined_at) values (v_appt, v_start + interval '1 minute');
        elsif v_status = 'completed' then
          insert into public.consultations (appointment_id, patient_joined_at, doctor_joined_at, started_at, ended_at, ended_by, last_activity_at)
          values (v_appt, v_start - interval '2 minutes', v_start, v_start + interval '1 minute',
                  v_end - make_interval(mins => floor(random() * 5)::integer), v_doc.user_id, v_end);
          perform public.post_consultation_earning(v_appt);

          if random() < 0.5 then
            v_rx := gen_random_uuid();
            insert into public.prescriptions (id, appointment_id, patient_id, doctor_id, status, presenting_symptoms, diagnosis, advice, follow_up)
            values (v_rx, v_appt, v_patient, v_doc.user_id, 'draft',
              v_doc.ref -> 'reasons' ->> 0,
              v_doc.ref -> 'dx' ->> floor(random() * jsonb_array_length(v_doc.ref -> 'dx'))::integer,
              'Rest, stay hydrated and follow the medicines below. Seek urgent care if symptoms get worse.',
              'Follow up in 2 weeks if not improving.');
            v_idx := 0;
            for v_med in select jsonb_array_elements_text(v_doc.ref -> 'meds') loop
              v_parts := string_to_array(v_med, '|');
              insert into public.prescription_items (prescription_id, position, medication_name, strength, frequency, duration)
              values (v_rx, v_idx, v_parts[1], nullif(v_parts[2], '—'), v_parts[3], nullif(v_parts[4], '—'));
              v_idx := v_idx + 1;
            end loop;
            select jsonb_build_object('name', p.full_name, 'date_of_birth', pp.date_of_birth, 'sex', pp.sex,
              'consultation_date', v_start, 'consultation_mode', v_mode, 'reference', v_ref)
            into v_patient_snap from public.profiles p join public.patient_profiles pp on pp.user_id = p.id where p.id = v_patient;
            update public.prescriptions set status = 'final', finalized_at = v_end, doctor_snapshot = v_doctor_snap,
              patient_snapshot = v_patient_snap, content_hash = encode(sha256(convert_to(v_rx::text || v_ref, 'UTF8')), 'hex')
            where id = v_rx;
          end if;

          if random() < 0.6 then
            v_r := random();
            v_rating := case when v_r < 0.55 then 5 when v_r < 0.85 then 4 when v_r < 0.95 then 3 when v_r < 0.99 then 2 else 1 end;
            v_comment := case when random() < 0.7 then
              format(case when v_rating >= 4 then v_good[1 + floor(random() * array_length(v_good, 1))::integer]
                          else v_meh[1 + floor(random() * array_length(v_meh, 1))::integer] end, v_doc.ref ->> 'topic') end;
            insert into public.doctor_reviews (appointment_id, doctor_id, patient_id, rating, comment, is_anonymous, comment_status, moderated_at, created_at)
            values (v_appt, v_doc.user_id, v_patient, v_rating, v_comment, random() < 0.15,
                    case when v_comment is null then 'none' else 'approved' end,
                    case when v_comment is not null then least(now(), v_end + interval '2 days') end,
                    least(now(), v_end + make_interval(hours => 1 + floor(random() * 48)::integer)));
          end if;
        end if;
      end loop;
    end loop;
  end loop;

  insert into public.platform_settings (key, value) values ('demo', '{"enabled": true}')
  on conflict (key) do update set value = excluded.value;

  -- Nothing created by this run may be emailed or shown as a notification.
  delete from public.notifications where created_at = v_t0;
  delete from public.email_outbox where created_at = v_t0;
end;
$$;

select role, email, password from demo_showcase order by role, email;
