"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import { friendlyError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { buildIceServers, type IceServer } from "@/lib/webrtc/ice";

/** Records the join (and starts the consultation when the doctor joins), then returns ICE config. */
export async function joinConsultationAction(
  appointmentId: string,
): Promise<{ ok: true; status: string; iceServers: IceServer[] } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Please sign in again." };
  const id = z.string().uuid().safeParse(appointmentId);
  if (!id.success) return { ok: false, error: "Invalid consultation." };
  const supabase = await createClient();
  // join_consultation checks participant, status and the join window in the database.
  const { data, error } = await supabase.rpc("join_consultation", { p_appointment: id.data });
  if (error || !data) return { ok: false, error: friendlyError(error) };
  return { ok: true, status: (data as { status: string }).status, iceServers: buildIceServers(serverEnv(), viewer.id) };
}

export async function markReadAction(appointmentId: string) {
  const supabase = await createClient();
  await supabase.rpc("mark_messages_read", { p_appointment: appointmentId });
}
