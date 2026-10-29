/** Health topic pages, adapted from the legacy Docothink website's topic pages. */
export type HealthTopic = {
  slug: string;
  title: string;
  intro: string;
  specialty: string;
  sections: { heading: string; body: string; bullets?: string[] }[];
};

export const HEALTH_TOPICS: HealthTopic[] = [
  {
    slug: "mental-health",
    title: "Mental health",
    specialty: "psychiatry",
    intro:
      "Talking to someone is often the first step. Our psychiatrists and mental health specialists offer confidential consultations by chat, audio or video.",
    sections: [
      {
        heading: "Conditions we can help with",
        body: "Consultations cover assessment, treatment planning and follow-up for common conditions, including:",
        bullets: ["Anxiety and panic", "Depression and low mood", "Insomnia and sleep problems", "Bipolar disorder (follow-up care)", "Stress and burnout"],
      },
      {
        heading: "What to expect",
        body: "Your doctor will ask about your symptoms, history and current medicines, agree a plan with you and, where appropriate, issue a prescription or recommend in-person care.",
      },
      {
        heading: "If you are in crisis",
        body: "If you are thinking about harming yourself or are in immediate danger, call your local emergency number now: 911 (US), 999 (UK) or 112 (India). In the US you can also call or text 988; in the UK call Samaritans on 116 123.",
      },
    ],
  },
  {
    slug: "womens-health",
    title: "Women's health",
    specialty: "gynaecology",
    intro: "Private consultations with gynaecologists and obstetricians for periods, PCOS, fertility, pregnancy and menopause.",
    sections: [
      {
        heading: "Common reasons to consult",
        body: "Women often consult online for:",
        bullets: ["Irregular or painful periods, PCOD/PCOS", "Vaginal discharge and infections", "Contraception advice", "Pregnancy planning and antenatal questions", "Menopause symptoms"],
      },
      {
        heading: "Your privacy",
        body: "Your consultation and records are visible only to you and the doctors treating you. You choose what to share.",
      },
    ],
  },
  {
    slug: "child-care",
    title: "Child care",
    specialty: "pediatrics",
    intro: "Paediatricians who can advise on fevers, rashes, feeding, growth and development, with a parent or guardian present.",
    sections: [
      {
        heading: "When an online consultation helps",
        body: "Online consultations work well for:",
        bullets: ["Mild fevers, coughs and colds", "Skin rashes and eczema", "Feeding and sleep questions", "Growth and development concerns", "Vaccination advice"],
      },
      {
        heading: "When to seek urgent care",
        body: "Go to an emergency department or call emergency services if your child has difficulty breathing, is unusually drowsy or floppy, has a seizure, a rash that does not fade when pressed, or signs of dehydration.",
      },
    ],
  },
  {
    slug: "ayurveda",
    title: "Ayurveda",
    specialty: "general-medicine",
    intro:
      "Some patients want to discuss traditional approaches alongside conventional care. Talk to a doctor about how lifestyle, diet and complementary therapies fit with your treatment.",
    sections: [
      {
        heading: "Safe, joined-up care",
        body: "Always tell your doctor about any herbal or Ayurvedic preparations you take, as some interact with prescription medicines. Docothink doctors provide evidence-based advice and will not recommend stopping prescribed treatment without a clinical reason.",
      },
    ],
  },
];
