/** Mirrors the checks in public.save_private_details() so forms can explain problems before saving. */

export const BANK_COUNTRIES = ["IN", "GB", "US"] as const;
export type BankCountry = (typeof BANK_COUNTRIES)[number];

export const KYC_PATTERNS = {
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gstin: /^[0-9]{2}[A-Z0-9]{13}$/,
  sortCode: /^[0-9]{6}$/,
  routing: /^[0-9]{9}$/,
  taxId: /^[0-9]{9}$/,
  account: { IN: /^[0-9]{9,18}$/, GB: /^[0-9]{8}$/, US: /^[0-9]{4,17}$/ } satisfies Record<BankCountry, RegExp>,
};

export const BANK_FIELDS: Record<BankCountry, { required: string[]; optional: string[] }> = {
  IN: { required: ["account_holder_name", "bank_name", "account_number", "ifsc", "pan"], optional: ["gstin"] },
  GB: { required: ["account_holder_name", "bank_name", "account_number", "sort_code"], optional: [] },
  US: { required: ["account_holder_name", "bank_name", "account_number", "routing_number", "account_type", "tax_id"], optional: [] },
};

export type CompletenessItem = { key: string; label: string; tab: "professional" | "address" | "bank" };

export function profileCompleteness(input: {
  education: number;
  experience: number;
  services: number;
  specialInterests: number;
  addressComplete: boolean;
  kycStatus: string;
}): { done: number; total: number; missing: CompletenessItem[] } {
  const items: (CompletenessItem & { ok: boolean })[] = [
    { key: "education", label: "Education", tab: "professional", ok: input.education > 0 },
    { key: "experience", label: "Experience", tab: "professional", ok: input.experience > 0 },
    { key: "services", label: "Services & treatments", tab: "professional", ok: input.services > 0 },
    { key: "address", label: "Address", tab: "address", ok: input.addressComplete },
    { key: "bank", label: "Bank & tax verified", tab: "bank", ok: input.kycStatus === "verified" },
  ];
  return {
    done: items.filter((i) => i.ok).length,
    total: items.length,
    missing: items.filter((i) => !i.ok).map(({ key, label, tab }) => ({ key, label, tab })),
  };
}

/** One item per line: trimmed, blanks dropped, case-insensitive duplicates removed. */
export function parseLines(text: string, max: number, maxLen: number): { items: string[]; error?: string } {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || seen.has(line.toLowerCase())) continue;
    if (line.length > maxLen) return { items, error: `Each item must be ${maxLen} characters or fewer.` };
    seen.add(line.toLowerCase());
    items.push(line);
  }
  if (items.length > max) return { items, error: `Keep it to ${max} items or fewer.` };
  return { items };
}
