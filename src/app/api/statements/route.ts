import { NextResponse, type NextRequest } from "next/server";
import { getViewer, hasPermission } from "@/lib/auth/viewer";
import { getLedger } from "@/features/finance/queries";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  // Neutralise spreadsheet formula injection and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Ledger statement as CSV. Doctors get their own; finance admins can pass ?doctor=<id> or get all. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const doctorParam = request.nextUrl.searchParams.get("doctor") ?? undefined;
  let doctorId: string | undefined;
  if (viewer.role === "doctor") doctorId = viewer.id;
  else if (hasPermission(viewer, "finance.manage")) doctorId = doctorParam && /^[0-9a-f-]{36}$/i.test(doctorParam) ? doctorParam : undefined;
  else return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await getLedger({ doctorId, limit: 10000 });
  const header = ["date_utc", "doctor_id", "type", "description", "currency", "gross_minor", "commission_minor", "net_minor", "settled"];
  const lines = [header.map(csvCell).join(",")].concat(
    rows.map((r) => [r.created_at, r.doctor_id, r.entry_type, r.description, r.currency, r.gross_amount, r.commission_amount, r.amount, r.in_payout].map(csvCell).join(",")),
  );
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="docothink-statement-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
