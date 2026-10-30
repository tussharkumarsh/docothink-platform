import { NextResponse, type NextRequest } from "next/server";
import { getViewer, hasPermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** TDS withheld on paid invoices, for the accountant (deposit and Form 16A). Finance admins only; contains full PANs. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!hasPermission(viewer, "finance.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const supabase = await createClient();
  let query = supabase
    .from("doctor_payouts")
    .select("invoice_number, paid_at, currency, gross_amount, tds_rate_bps, tds_amount, amount, transaction_reference, bank_snapshot, doctor_profiles(title, display_name)")
    .eq("source", "invoice")
    .eq("status", "paid")
    .gt("tds_amount", 0)
    .order("paid_at")
    .limit(10000);
  if (isDate(from)) query = query.gte("paid_at", `${from}T00:00:00Z`);
  if (isDate(to)) query = query.lte("paid_at", `${to}T23:59:59Z`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });

  const header = ["invoice_number", "paid_at_utc", "doctor", "pan", "currency", "gross_minor", "tds_rate_percent", "tds_minor", "net_paid_minor", "transaction_reference"];
  const lines = [header.map(csvCell).join(",")].concat(
    (data ?? []).map((p) => {
      const d = p.doctor_profiles as unknown as { title: string; display_name: string } | null;
      const snap = (p.bank_snapshot ?? {}) as { pan?: string | null };
      return [p.invoice_number, p.paid_at, d ? `${d.title} ${d.display_name}` : "", snap.pan ?? "", p.currency, p.gross_amount, p.tds_rate_bps / 100, p.tds_amount, p.amount, p.transaction_reference]
        .map(csvCell)
        .join(",");
    }),
  );
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="docothink-tds-${from ?? "all"}-${to ?? "all"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
