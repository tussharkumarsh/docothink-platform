import { z } from "zod";

/**
 * Patient medical questionnaire. Every field of the legacy Docothink patient record is preserved:
 * drug allergies, "have you ever had", other illnesses, operations, current medications (name +
 * dose), healthy/unhealthy habits, reason for visit (now per appointment), allergies & reactions,
 * past surgeries/hospitalisations, family history, and the 12-system review of symptoms.
 * Stored as JSONB in patient_medical_profiles.data, keyed by section.
 */

const text = (max = 2000) => z.string().trim().max(max).optional().default("");
const yesNo = z.enum(["", "yes", "no", "unsure"]).optional().default("");

export const REVIEW_OF_SYSTEMS: Record<string, { label: string; symptoms: string[] }> = {
  constitutional: { label: "General", symptoms: ["Fever", "Fatigue", "Weight gain", "Weight loss", "Sleep disturbances", "Chills", "Feeling poorly", "Sweats"] },
  heent: { label: "Head, eyes, ears, nose, throat", symptoms: ["Vision problem", "Red eyes", "Eye pain", "Itchy eyes", "Light sensitivity", "Congestion", "Nosebleed", "Decreased hearing", "Earache", "Vertigo", "Dry mouth", "Hoarseness", "Sore throat", "Neck stiffness", "Flu-like symptoms"] },
  cardiovascular: { label: "Heart and circulation", symptoms: ["Chest pain", "Palpitations", "Irregular heart rhythm", "Cold hands or feet", "Leg swelling", "Leg pain when walking"] },
  respiratory: { label: "Breathing", symptoms: ["Shortness of breath", "Wheezing", "Cough", "Coughing up sputum", "Coughing up blood", "Rapid breathing", "Chest congestion"] },
  gastrointestinal: { label: "Digestion", symptoms: ["Abdominal pain", "Nausea", "Vomiting", "Vomiting blood", "Diarrhoea", "Change in bowels", "Blood in stool", "Black tarry stools", "Painful swallowing", "Decreased appetite", "Bowel incontinence", "Yellow skin"] },
  neurological: { label: "Nervous system", symptoms: ["Headache", "Dizziness", "Unsteadiness", "Numbness", "Tingling", "Tremor", "Disorientation", "Confusion", "Memory lapses", "Decreased strength"] },
  musculoskeletal: { label: "Muscles and joints", symptoms: ["Joint pain", "Joint swelling", "Limb pain", "Muscle pain", "Muscle weakness", "Muscle cramps", "Neck pain", "Back pain"] },
  genitourinary: { label: "Urinary and reproductive", symptoms: ["Frequent urination", "Urinary urgency", "Painful urination", "Night-time urination", "Incontinence", "Pelvic pain", "Painful intercourse", "Change in libido", "Genital itching", "Vaginal discharge", "Vaginal bleeding", "Heavy periods", "Irregular cycles"] },
  integumentary: { label: "Skin", symptoms: ["Rash", "Itching", "Dry skin", "Skin wound", "Unusual growth", "Change in a mole", "History of skin cancer"] },
  psychiatric: { label: "Mood", symptoms: ["Depression", "Anxiety"] },
  hematologic: { label: "Blood and lymph", symptoms: ["Easy bruising", "Easy bleeding", "Swollen lymph nodes"] },
  endocrine: { label: "Hormones", symptoms: ["Excessive thirst", "Heat intolerance", "Cold intolerance", "Skin changes", "Hair changes"] },
};

export const sectionSchemas = {
  conditions: z.object({
    existing_conditions: text(),
    have_you_ever_had: text(),
    other_illnesses: text(),
  }),
  medications: z.object({
    takes_medication: yesNo,
    items: z.array(z.object({ name: z.string().trim().min(1).max(200), dose: text(100), frequency: text(100) })).max(30).default([]),
  }),
  allergies: z.object({
    has_allergies: yesNo,
    drug_allergies: text(),
    items: z.array(z.object({ substance: z.string().trim().min(1).max(200), reaction: text(300) })).max(30).default([]),
  }),
  surgeries: z.object({
    items: z.array(z.object({ procedure: z.string().trim().min(1).max(200), date: text(40), complications: text(500) })).max(30).default([]),
  }),
  family_history: z.object({
    items: z
      .array(z.object({ relative: z.string().trim().min(1).max(100), condition: z.string().trim().min(1).max(300), living: yesNo, age_if_deceased: text(10) }))
      .max(30)
      .default([]),
  }),
  lifestyle: z.object({
    exercise: text(200),
    diet: text(200),
    alcohol: text(200),
    caffeine: text(200),
    smoking: text(200),
  }),
  review_of_systems: z.object(
    Object.fromEntries(
      Object.entries(REVIEW_OF_SYSTEMS).map(([key, def]) => [key, z.array(z.enum(def.symptoms as [string, ...string[]])).default([])]),
    ) as Record<string, z.ZodDefault<z.ZodArray<z.ZodEnum<Record<string, string>>>>>,
  ),
  treatments: z.object({
    previous_treatments: text(),
    other_comments: text(),
  }),
  womens_health: z.object({
    pregnant: yesNo,
    breastfeeding: yesNo,
    last_menstrual_period: text(40),
  }),
} as const;

export type SectionKey = keyof typeof sectionSchemas;

export const SECTIONS: { key: SectionKey; title: string; description: string; onlyFor?: "female" }[] = [
  { key: "conditions", title: "Conditions & diagnoses", description: "Long-term conditions and past illnesses." },
  { key: "medications", title: "Current medications", description: "Including over-the-counter medicines, supplements and herbs." },
  { key: "allergies", title: "Allergies", description: "Allergies to medicines or other substances, and the reaction." },
  { key: "surgeries", title: "Surgeries & hospital stays", description: "Past procedures and hospitalisations." },
  { key: "family_history", title: "Family history", description: "Major conditions in your immediate family." },
  { key: "lifestyle", title: "Lifestyle", description: "Exercise, diet, alcohol, caffeine and smoking." },
  { key: "review_of_systems", title: "Recent symptoms", description: "Anything you've experienced in the past few months." },
  { key: "treatments", title: "Previous treatments & notes", description: "Treatments tried and anything else your doctor should know." },
  { key: "womens_health", title: "Women's health", description: "Pregnancy and menstrual information.", onlyFor: "female" },
];

export function applicableSections(sex: string | null) {
  return SECTIONS.filter((s) => !s.onlyFor || s.onlyFor === sex);
}

export function completion(completed: string[], sex: string | null) {
  const sections = applicableSections(sex);
  const done = sections.filter((s) => completed.includes(s.key)).length;
  return { done, total: sections.length, percent: Math.round((done / sections.length) * 100) };
}
