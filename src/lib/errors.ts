/**
 * Database functions raise stable codes ("SLOT_TAKEN: ...", "FORBIDDEN"). Map them to safe,
 * human messages; anything unrecognised becomes a generic message (details stay in server logs,
 * which never include clinical content).
 */
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "You don't have permission to do that.",
  NOT_FOUND: "We couldn't find that record.",
  SLOT_TAKEN: "Sorry, that time was just booked by someone else. Please pick another slot.",
  SLOT_TOO_SOON: "That time is too soon to book. Please choose a later slot.",
  SLOT_BEYOND_HORIZON: "That date isn't open for booking yet.",
  SLOT_NOT_IN_SCHEDULE: "That time is not in the doctor's schedule.",
  SLOT_BLOCKED: "The doctor is unavailable at that time.",
  SLOT_DOCTOR_UNAVAILABLE: "This doctor isn't accepting bookings right now.",
  PATIENT_OVERLAP: "You already have an appointment at that time.",
  MODE_NOT_OFFERED: "This doctor doesn't offer that consultation type.",
  REASON_REQUIRED: "Please tell us the reason.",
  INVALID_TIMEZONE: "Please choose a valid time zone.",
  PAYMENT_WINDOW_CLOSED: "The reservation expired. Please book the slot again.",
  UPGRADE_NOT_ALLOWED: "This appointment can't be upgraded now.",
  UPGRADE_NOT_PRICED: "Only upgrades to a higher-priced consultation type are supported.",
  UPGRADE_REQUIRES_RESCHEDULE: "That consultation type isn't available in this slot. Request a reschedule instead.",
  NOTHING_TO_PAY: "There is nothing left to pay.",
  CANNOT_CANCEL: "This appointment can no longer be cancelled.",
  RESCHEDULE_NOT_ALLOWED: "This appointment can't be rescheduled.",
  REQUEST_ALREADY_PENDING: "You already have a pending reschedule request.",
  REQUEST_NOT_PENDING: "This request has already been decided.",
  SAME_SLOT: "Please choose a different time.",
  APPOINTMENT_NOT_CONFIRMED: "The appointment is no longer confirmed.",
  CONSULTATION_NOT_AVAILABLE: "This consultation isn't available.",
  CONSULTATION_TOO_EARLY: "The consultation room opens shortly before the appointment time.",
  CONSULTATION_WINDOW_CLOSED: "The consultation window has closed.",
  CONSULTATION_NOT_IN_PROGRESS: "The consultation isn't in progress.",
  APPLICATION_INCOMPLETE: "Your application is incomplete.",
  APPLICATION_NOT_EDITABLE: "Your application can't be changed in its current state.",
  CREDENTIALS_NOT_VERIFIED: "Verify the registration certificate and identity document first.",
  NOTE_REQUIRED: "Please add a note explaining this decision.",
  INVALID_TRANSITION: "That status change isn't allowed.",
  REGISTRATION_LOCKED: "Registration details can only be changed by support after approval.",
  RULE_OVERLAP: "This window overlaps another window on the same day.",
  DIAGNOSIS_REQUIRED: "Add an assessment or diagnosis before finalising.",
  AMENDMENT_REASON_REQUIRED: "Please give a reason for the amendment.",
  PRESCRIPTION_ALREADY_FINAL: "This prescription is final. Create an amendment instead.",
  AMENDMENT_ALREADY_IN_PROGRESS: "An amendment draft already exists.",
  TRANSACTION_REFERENCE_REQUIRED: "A transaction reference is required to mark a payout as paid.",
  CUTOFF_IN_FUTURE: "The settlement cut-off can't be in the future.",
  INVALID_AMOUNT: "That amount isn't valid.",
  FILE_TOO_LARGE: "That file is too large.",
  INVALID_FILE_TYPE: "That file type isn't supported.",
  DOCTOR_NOT_FOUND: "Doctor not found.",
  CANNOT_DEACTIVATE_SELF: "You can't deactivate your own account.",
  INVALID_SPECIALTIES: "Choose between 1 and 5 specialties.",
  INVALID_PRIMARY_SPECIALTY: "Choose a primary specialty from your selection.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  REVIEW_EXISTS: "You've already reviewed this consultation.",
  REVIEW_NOT_ALLOWED: "Reviews can be left only for completed consultations in the last 30 days.",
  INVALID_RATING: "Choose a rating from 1 to 5 stars.",
  COMMENT_TOO_LONG: "Please keep your comment under 1,000 characters.",
  REVIEW_NOT_FOUND: "That review no longer needs moderation.",
  DEMO_DOCTOR_NOT_BOOKABLE: "This is a demo profile and can't be booked. Please choose another doctor.",
  DEMO_PATIENT_REAL_DOCTOR: "Demo accounts can only book demo doctors.",
  INVALID_IFSC: "Enter a valid IFSC code, e.g. SBIN0001234.",
  INVALID_PAN: "Enter a valid PAN, e.g. ABCDE1234F.",
  INVALID_GSTIN: "Enter a valid 15-character GSTIN.",
  INVALID_ACCOUNT_NUMBER: "Enter a valid account number for the selected country.",
  INVALID_SORT_CODE: "Enter a 6-digit sort code.",
  INVALID_ROUTING_NUMBER: "Enter a 9-digit routing number.",
  INVALID_TAX_ID: "Enter a 9-digit SSN or EIN.",
  INVALID_ACCOUNT_TYPE: "Choose checking or savings.",
  INVALID_BANK_COUNTRY: "Choose India, the United Kingdom or the United States.",
  INVALID_COUNTRY: "Use a two-letter country code, e.g. IN.",
  MISMATCHED_FIELDS: "Some details don't belong to the selected bank country. Clear them and try again.",
  NOT_PENDING: "These details aren't waiting for review.",
  STALE_DETAILS: "The doctor changed these details after you opened the page. Reload and check them again before deciding.",
};

const INCOMPLETE_FIELDS: Record<string, string> = {
  display_name: "your name",
  qualifications: "qualifications",
  registration_number: "medical registration number",
  registration_country: "registration country",
  fees: "at least one consultation fee",
  terms: "acceptance of the platform terms",
  specialty: "a specialty",
  registration_certificate: "a registration certificate upload",
  identity_document: "an identity document upload",
};

export function errorCode(error: unknown): string | null {
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : String(error ?? "");
  const match = message.match(/^([A-Z][A-Z_]+)(?::|$)/);
  return match ? match[1] : null;
}

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const message = typeof error === "object" && error && "message" in error ? String(error.message) : String(error ?? "");
  const code = errorCode(error);
  if (code === "APPLICATION_INCOMPLETE") {
    const missing = message.split(":")[1]?.split(",").map((f) => INCOMPLETE_FIELDS[f.trim()] ?? f.trim()) ?? [];
    return missing.length ? `Your application is missing: ${missing.join(", ")}.` : MESSAGES.APPLICATION_INCOMPLETE;
  }
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback;
}

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export const idle: ActionResult = { ok: true };
