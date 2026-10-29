import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates";

const base = {
  reference: "DT-ABC123",
  start_at: "2026-11-02T13:30:00Z",
  mode: "video" as const,
  status: "confirmed" as const,
  patient_name: "Emily Carter",
  doctor_name: "Dr. Anjali Mehta",
  link: "/patient/appointments/x",
};

describe("appointment emails", () => {
  it("states the time in the recipient's zone with an explicit zone label", () => {
    const patient = renderEmail("appointment_confirmed", { ...base, recipient_role: "patient", recipient_timezone: "America/New_York" }, "https://app.example");
    expect(patient.text).toContain("8:30");
    expect(patient.text).toContain("(America/New_York)");
    expect(patient.text).toContain("Doctor: Dr. Anjali Mehta");
    expect(patient.text).toContain("Consultation: Video call");
    expect(patient.text).toContain("https://app.example/patient/appointments/x");

    const doctor = renderEmail("appointment_confirmed", { ...base, recipient_role: "doctor", recipient_timezone: "Asia/Kolkata" }, "https://app.example");
    expect(doctor.text).toContain("7:00");
    expect(doctor.text).toContain("(Asia/Kolkata)");
    expect(doctor.text).toContain("Patient: Emily Carter");
  });

  it("escapes HTML and carries no attachments or clinical fields", () => {
    const email = renderEmail("appointment_confirmed", { ...base, patient_name: "<script>x</script>", recipient_role: "doctor", recipient_timezone: "UTC" }, "https://app.example");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).not.toMatch(/diagnos|symptom|reason/i);
  });
});
