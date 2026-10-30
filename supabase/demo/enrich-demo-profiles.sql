-- ============================================================================
-- DEMO DATA: fills the professional profile sections (special interests, services, skills, awards,
-- memberships, practice start year) of demo doctors created by seed-demo.sql. Run after the seed:
--
--   npx supabase db query --linked -f supabase/demo/enrich-demo-profiles.sql
--
-- Idempotent: only touches demo doctors whose services are still empty. Creates no bank, tax or
-- address data. Awards are labelled "(demo)" so they can't be mistaken for real recognition.
-- ============================================================================

do $$
declare
  v_ref jsonb := $j${
    "general-medicine": {"i": ["Preventive health checks", "Chronic disease management", "Travel medicine"], "s": ["Fever and infection consultation", "Blood pressure review", "Diabetes screening advice", "Health check-up review", "Vaccination guidance"], "k": ["Fever", "Cough and cold", "Fatigue", "Hypertension", "Thyroid disorders"]},
    "dermatology": {"i": ["Acne and scarring", "Paediatric dermatology", "Hair and scalp disorders"], "s": ["Acne treatment", "Eczema and psoriasis care", "Hair-loss consultation", "Pigmentation treatment", "Skin allergy assessment"], "k": ["Acne", "Eczema", "Psoriasis", "Fungal infections", "Melasma"]},
    "cardiology": {"i": ["Preventive cardiology", "Hypertension", "Heart failure follow-up"], "s": ["Blood pressure management", "Cholesterol review", "ECG report review", "Second opinion on heart tests", "Cardiac risk assessment"], "k": ["Hypertension", "High cholesterol", "Palpitations", "Chest pain review", "Heart failure"]},
    "ophthalmology": {"i": ["Dry eye", "Refractive errors", "Diabetic eye care"], "s": ["Red eye assessment", "Vision problem consultation", "Dry eye treatment", "Diabetic eye review", "Glasses prescription advice"], "k": ["Conjunctivitis", "Dry eye", "Blurred vision", "Eye strain", "Cataract advice"]},
    "orthopedics": {"i": ["Sports injuries", "Knee and shoulder pain", "Spine care"], "s": ["Joint pain consultation", "Back pain management", "Sports injury advice", "Fracture follow-up", "Physiotherapy planning"], "k": ["Knee pain", "Back pain", "Frozen shoulder", "Arthritis", "Ligament injury"]},
    "pediatrics": {"i": ["Newborn care", "Childhood nutrition", "Allergies in children"], "s": ["Child fever consultation", "Growth and development check", "Vaccination schedule advice", "Feeding and nutrition advice", "Childhood allergy review"], "k": ["Fever", "Cough", "Diarrhoea", "Rashes", "Poor appetite"]},
    "gynaecology": {"i": ["PCOS", "Menstrual disorders", "Menopause care"], "s": ["Period problem consultation", "PCOS management", "Contraception advice", "Menopause support", "Fertility guidance"], "k": ["PCOS", "Irregular periods", "Painful periods", "Vaginal infections", "Menopause symptoms"]},
    "obstetrics": {"i": ["Early pregnancy care", "High-risk pregnancy", "Postnatal care"], "s": ["Pregnancy consultation", "Antenatal report review", "Pregnancy nutrition advice", "Postnatal check-in", "Pregnancy symptom advice"], "k": ["Morning sickness", "Pregnancy planning", "Gestational diabetes", "Anaemia in pregnancy", "Postnatal recovery"]},
    "ent": {"i": ["Sinus disorders", "Hearing problems", "Voice disorders"], "s": ["Sinus treatment", "Ear infection consultation", "Tonsillitis care", "Hearing concern review", "Allergic rhinitis management"], "k": ["Sinusitis", "Ear pain", "Tonsillitis", "Vertigo", "Snoring"]},
    "dentistry": {"i": ["Preventive dentistry", "Gum health", "Tooth sensitivity"], "s": ["Toothache consultation", "Gum disease advice", "Dental hygiene planning", "Tooth sensitivity treatment advice", "Orthodontic second opinion"], "k": ["Toothache", "Bleeding gums", "Sensitivity", "Mouth ulcers", "Bad breath"]},
    "psychiatry": {"i": ["Anxiety disorders", "Depression", "Sleep problems"], "s": ["Anxiety consultation", "Depression management", "Sleep problem assessment", "Stress and burnout support", "Medication review"], "k": ["Anxiety", "Depression", "Insomnia", "Panic attacks", "Stress"]},
    "neurology": {"i": ["Headache and migraine", "Nerve pain", "Epilepsy follow-up"], "s": ["Migraine management", "Headache assessment", "Nerve pain consultation", "Seizure follow-up", "Dizziness assessment"], "k": ["Migraine", "Headache", "Numbness", "Seizures", "Vertigo"]},
    "gastroenterology": {"i": ["Acid reflux", "Irritable bowel syndrome", "Liver health"], "s": ["Acidity and reflux treatment", "IBS management", "Liver test review", "Digestive health consultation", "Diet advice for gut health"], "k": ["Acidity", "Bloating", "IBS", "Constipation", "Fatty liver"]},
    "pulmonology": {"i": ["Asthma", "Chronic cough", "Sleep apnoea"], "s": ["Asthma management", "Chronic cough assessment", "Inhaler technique review", "Lung function report review", "Post-COVID breathing support"], "k": ["Asthma", "Chronic cough", "Breathlessness", "COPD", "Allergic bronchitis"]},
    "endocrinology": {"i": ["Thyroid disorders", "Hormonal imbalance", "Obesity medicine"], "s": ["Thyroid management", "Hormone report review", "Weight management", "PCOS hormone review", "Vitamin D deficiency care"], "k": ["Hypothyroidism", "Hyperthyroidism", "Obesity", "PCOS", "Vitamin D deficiency"]},
    "diabetology": {"i": ["Type 2 diabetes", "Prediabetes reversal", "Diabetes in pregnancy"], "s": ["Diabetes management", "Blood sugar report review", "Insulin guidance", "Diabetic diet planning", "Prediabetes counselling"], "k": ["Type 2 diabetes", "Prediabetes", "High HbA1c", "Diabetic neuropathy", "Gestational diabetes"]},
    "urology": {"i": ["Urinary tract infections", "Kidney stones", "Prostate health"], "s": ["UTI treatment", "Kidney stone advice", "Prostate consultation", "Urinary frequency assessment", "Men's health review"], "k": ["UTI", "Kidney stones", "Enlarged prostate", "Frequent urination", "Incontinence"]},
    "nephrology": {"i": ["Chronic kidney disease", "Kidney function", "Hypertension and kidneys"], "s": ["Kidney function report review", "CKD management", "Fluid and salt advice", "Dialysis planning advice", "Kidney diet counselling"], "k": ["Chronic kidney disease", "High creatinine", "Swelling", "Protein in urine", "Kidney-related hypertension"]},
    "rheumatology": {"i": ["Inflammatory arthritis", "Autoimmune disease", "Osteoporosis"], "s": ["Joint pain assessment", "Arthritis management", "Autoimmune report review", "Osteoporosis advice", "Gout management"], "k": ["Rheumatoid arthritis", "Osteoarthritis", "Gout", "Lupus", "Osteoporosis"]},
    "allergy-immunology": {"i": ["Allergic rhinitis", "Food allergy", "Skin allergy"], "s": ["Allergy consultation", "Allergy test review", "Hay fever management", "Food allergy guidance", "Hives treatment"], "k": ["Allergic rhinitis", "Food allergy", "Hives", "Asthma triggers", "Drug allergy"]},
    "infectious-diseases": {"i": ["Travel-related illness", "Recurrent infections", "Antibiotic stewardship"], "s": ["Fever after travel", "Infection consultation", "Vaccination advice", "Recurrent infection review", "Antibiotic guidance"], "k": ["Dengue advice", "Typhoid", "UTI", "Skin infections", "Tuberculosis follow-up"]},
    "hiv-aids": {"i": ["HIV treatment", "PrEP and PEP", "Sexual health screening"], "s": ["HIV treatment review", "PrEP counselling", "Confidential testing advice", "Medication side-effect review", "Viral load report review"], "k": ["HIV", "PrEP", "PEP", "Opportunistic infections", "Treatment adherence"]},
    "dietetics-nutrition": {"i": ["Weight management", "Diabetic nutrition", "Sports nutrition"], "s": ["Weight-loss diet plan", "Diabetes diet plan", "Cholesterol diet plan", "PCOS nutrition", "Sports nutrition plan"], "k": ["Obesity", "High cholesterol", "Diabetes diet", "PCOS", "Vitamin deficiencies"]},
    "sexual-health": {"i": ["Confidential sexual health", "STI screening", "Contraception"], "s": ["Confidential consultation", "STI screening advice", "Contraception counselling", "Sexual wellness consultation", "Test result review"], "k": ["STI concerns", "Erectile dysfunction", "Contraception", "Low libido", "Safe sex counselling"]},
    "cosmetology": {"i": ["Hair loss", "Pigmentation", "Anti-ageing skin care"], "s": ["Hair-fall treatment", "Pigmentation consultation", "Skin care routine planning", "Scar treatment advice", "Anti-ageing consultation"], "k": ["Hair loss", "Melasma", "Acne scars", "Dull skin", "Dark circles"]}
  }$j$;
  v_members jsonb := '{"IN": ["Indian Medical Association", "Association of Physicians of India", "Indian Academy of Paediatrics"],
                       "GB": ["British Medical Association", "Royal College of Physicians", "Royal College of General Practitioners"],
                       "US": ["American Medical Association", "American College of Physicians", "American Academy of Family Physicians"]}';
  v_awards text[] := array['Excellence in Patient Care (demo)', 'Best Young Clinician Award (demo)', 'Teleconsultation Champion (demo)', 'Outstanding Service Award (demo)'];
  v_doc record;
  v_r jsonb;
  v_n integer;
begin
  perform setseed(0.7);
  for v_doc in
    select d.user_id, d.country, d.years_experience, s.slug
    from public.doctor_profiles d
    join public.doctor_specialties ds on ds.doctor_id = d.user_id and ds.is_primary
    join public.specialties s on s.id = ds.specialty_id
    where d.is_demo and d.services = '{}'
    order by d.registration_number
  loop
    v_r := v_ref -> v_doc.slug;
    continue when v_r is null;
    v_n := floor(random() * 3)::integer; -- 0–2 awards
    update public.doctor_profiles set
      special_interests = (select array_agg(x) from (select jsonb_array_elements_text(v_r -> 'i') x limit 2 + floor(random() * 2)::integer) t),
      services = (select array_agg(x) from (select jsonb_array_elements_text(v_r -> 's') x limit 4 + floor(random() * 2)::integer) t),
      skills = (select array_agg(x) from jsonb_array_elements_text(v_r -> 'k') x),
      awards = coalesce((select jsonb_agg(jsonb_build_object('title', a, 'organization', 'Docothink demo', 'year', 2018 + floor(random() * 8)::integer))
                         from (select unnest(v_awards) a order by random() limit v_n) t), '[]'::jsonb),
      memberships = (select jsonb_agg(jsonb_build_object('organization', m, 'role', 'Member', 'since', 2005 + floor(random() * 15)::integer))
                     from (select jsonb_array_elements_text(v_members -> coalesce(v_doc.country, 'IN')) m limit 1 + floor(random() * 2)::integer) t),
      practice_started_year = extract(year from now())::integer - coalesce(v_doc.years_experience, 5) - floor(random() * 5)::integer
    where user_id = v_doc.user_id;
  end loop;
end;
$$;
