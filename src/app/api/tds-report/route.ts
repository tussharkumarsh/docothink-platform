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

type TdsRow = {
  invoice_number: string; paid_at: string; doctor_name: string; pan: string | null; currency: string;
  gross_amount: number; tds_rate_bps: number; tds_amount: number; net_amount: number; transaction_reference: string | null;
};

/** TDS withheld on paid invoices, for the accountant (deposit and Form 16A). Finance admins only; full PANs; each export is audited. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!hasPermission(viewer, "finance.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tds_report", { p_from: isDate(from) ? from : null, p_to: isDate(to) ? to : null });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });

  const header = ["invoice_number", "paid_at_utc", "doctor", "pan", "currency", "gross_minor", "tds_rate_percent", "tds_minor", "net_paid_minor", "transaction_reference"];
  const lines = [header.map(csvCell).join(",")].concat(
    ((data ?? []) as TdsRow[]).map((r) =>
      [r.invoice_number, r.paid_at, r.doctor_name, r.pan, r.currency, r.gross_amount, r.tds_rate_bps / 100, r.tds_amount, r.net_amount, r.transaction_reference]
        .map(csvCell)
        .join(","),
    ),
  );
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="docothink-tds-${isDate(from) ? from : "all"}-${isDate(to) ? to : "all"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
