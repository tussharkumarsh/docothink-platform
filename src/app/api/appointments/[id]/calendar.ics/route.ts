import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { buildIcs } from "@/lib/calendar";
import { MODE_LABELS, type ConsultationMode } from "@/lib/domain";

/** iCalendar file for one appointment. RLS limits the read to the appointment's own patient and doctor. */
export async function GET(_: NextRequest, { params }: RouteContext<"/api/appointments/[id]/calendar.ics">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: a } = await supabase.from("appointments").select("id, reference, mode, start_at, end_at").eq("id", id).maybeSingle();
  if (!a) return new NextResponse("Not found", { status: 404 });
  const join = `${publicEnv.siteUrl}/consult/${a.id}`;
  const ics = buildIcs({
    uid: `${a.id}@docothink`,
    start: a.start_at,
    end: a.end_at,
    summary: `Docothink consultation · ${MODE_LABELS[a.mode as ConsultationMode]}`,
    description: `Join: ${join}\nReference: ${a.reference}`,
    url: join,
    now: new Date().toISOString(),
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="docothink-${a.reference}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
