"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui";
import type { IceServer } from "@/lib/webrtc/ice";
import type { ConsultationMode } from "@/lib/domain";
import { joinConsultationAction } from "../actions";
import { ChatPanel } from "./chat-panel";
import { CallPanel } from "./call-panel";

export function ConsultRoom(props: { appointmentId: string; selfId: string; role: "patient" | "doctor"; mode: ConsultationMode; timezone: string }) {
  const [state, setState] = useState<{ loading: true } | { loading: false; error?: string; iceServers: IceServer[] }>({ loading: true });

  useEffect(() => {
    let cancelled = false;
    joinConsultationAction(props.appointmentId).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { loading: false, iceServers: res.iceServers } : { loading: false, error: res.error, iceServers: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [props.appointmentId]);

  if (state.loading) {
    return <div className="flex h-96 items-center justify-center"><Loader2 className="size-6 animate-spin text-slate-400" aria-label="Joining" /></div>;
  }
  if (state.error) {
    return (
      <div className="space-y-4">
        <Alert tone="warning">{state.error}</Alert>
        <div className="h-[28rem] overflow-hidden rounded-card border border-slate-200 bg-white">
          <ChatPanel appointmentId={props.appointmentId} selfId={props.selfId} timezone={props.timezone} canSend={false} />
        </div>
      </div>
    );
  }

  const hasCall = props.mode === "audio" || props.mode === "video";
  return (
    <div className={hasCall ? "grid gap-4 lg:grid-cols-[1fr_22rem]" : ""}>
      {hasCall && (
        <div className="h-[60vh] min-h-[22rem] overflow-hidden rounded-card">
          <CallPanel appointmentId={props.appointmentId} selfId={props.selfId} role={props.role} mode={props.mode as "audio" | "video"} iceServers={state.iceServers} />
        </div>
      )}
      <div className={hasCall ? "h-[60vh] min-h-[22rem] overflow-hidden rounded-card border border-slate-200 bg-white" : "h-[70vh] overflow-hidden rounded-card border border-slate-200 bg-white"}>
        <ChatPanel appointmentId={props.appointmentId} selfId={props.selfId} timezone={props.timezone} canSend />
      </div>
    </div>
  );
}
