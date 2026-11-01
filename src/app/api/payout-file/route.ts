import { NextResponse, type NextRequest } from "next/server";
import { getViewer, hasPermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { csvBody } from "@/lib/csv";

type PayoutRow = {
  beneficiary_name: string;
  account_number: string;
  routing_code: string;
  bank_name: string;
  amount: number;
  currency: string;
  reference: string;
  email: string;
};

/** Bulk bank transfer file of approved invoices in one currency, for upload to the company bank. */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!hasPermission(viewer, "finance.manage")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const currency = (request.nextUrl.searchParams.get("currency") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "currency required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payout_file", { p_currency: currency });
  if (error) return NextResponse.json({ error: "could not build payout file" }, { status: 500 });

  const header = ["beneficiary_name", "account_number", "ifsc_or_sort_or_routing", "bank_name", "amount", "currency", "reference", "email"];
  const rows = ((data ?? []) as PayoutRow[]).map((r) => [
    r.beneficiary_name, r.account_number, r.routing_code, r.bank_name, Number(r.amount).toFixed(2), r.currency, r.reference, r.email,
  ]);
  return new NextResponse(csvBody(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="docothink-payouts-${currency}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
