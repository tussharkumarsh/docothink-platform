"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { Alert, Button, cn } from "@/components/ui";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { IceServer } from "@/lib/webrtc/ice";

type Phase = "idle" | "media" | "waiting" | "connecting" | "connected" | "reconnecting" | "failed" | "ended";
type Signal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; restart: boolean; from: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from: string }
  | { type: "candidate"; candidate: RTCIceCandidateInit; from: string }
  | { type: "bye"; from: string };
type Outgoing = Signal extends infer S ? (S extends Signal ? Omit<S, "from"> : never) : never;

const MEDIA_ERRORS: Record<string, string> = {
  NotAllowedError: "Camera/microphone permission was denied. Allow access in your browser's site settings, then try again.",
  NotFoundError: "No camera or microphone was found. Connect a device and try again.",
  NotReadableError: "Your camera or microphone is being used by another application.",
  OverconstrainedError: "Your device doesn't support the requested video settings.",
  SecurityError: "Media access requires a secure (https) connection.",
};

/**
 * Native WebRTC audio/video. Media flows peer-to-peer (or via TURN); Supabase Realtime only
 * carries signalling, on a private channel that RLS restricts to the two participants.
 * The doctor is always the caller (sends offers), which avoids offer collisions.
 */
export function CallPanel({ appointmentId, selfId, role, mode, iceServers }: { appointmentId: string; selfId: string; role: "patient" | "doctor"; mode: "audio" | "video"; iceServers: IceServer[] }) {
  const supabase = getBrowserClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [peerPresent, setPeerPresent] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const connectedAt = useRef<number | null>(null);
  const failures = useRef(0);
  const disconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);

  const send = useCallback((msg: Outgoing) => {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: { ...msg, from: selfId } });
  }, [selfId]);

  const teardownPeer = useCallback(() => {
    if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
    pcRef.current?.getSenders().forEach((s) => s.track && pcRef.current?.removeTrack(s));
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    if (remoteAudio.current) remoteAudio.current.srcObject = null;
  }, []);

  const restartIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || role !== "doctor") return;
    failures.current += 1;
    if (failures.current > 3) {
      setPhase("failed");
      setError("We couldn't keep a connection. This usually means a firewall is blocking peer-to-peer calls (a TURN relay is needed), or the network is unstable. You can continue in the chat.");
      return;
    }
    setPhase("reconnecting");
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    send({ type: "offer", sdp: pc.localDescription!.toJSON(), restart: true });
  }, [role, send]);

  const createPeer = useCallback(() => {
    teardownPeer();
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });
    streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      if (mode === "video" && remoteVideo.current) remoteVideo.current.srcObject = stream;
      if (remoteAudio.current) remoteAudio.current.srcObject = stream;
    };
    pc.onicecandidate = (e) => e.candidate && send({ type: "candidate", candidate: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        failures.current = 0;
        connectedAt.current ??= Date.now();
        if (disconnectTimer.current) clearTimeout(disconnectTimer.current);
        setPhase("connected");
        setError(null);
      } else if (state === "connecting") setPhase((p) => (p === "connected" ? "reconnecting" : "connecting"));
      else if (state === "disconnected") {
        setPhase("reconnecting");
        // Brief drops often recover on their own; restart ICE if not.
        disconnectTimer.current = setTimeout(() => pc.connectionState !== "connected" && restartIce(), 6000);
      } else if (state === "failed") restartIce();
    };
    pcRef.current = pc;
    return pc;
  }, [iceServers, mode, restartIce, send, teardownPeer]);

  const call = useCallback(async () => {
    const pc = createPeer();
    setPhase("connecting");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", sdp: pc.localDescription!.toJSON(), restart: false });
  }, [createPeer, send]);

  const handleSignal = useCallback(async (msg: Signal) => {
    if (msg.from === selfId) return;
    try {
      if (msg.type === "offer" && role === "patient") {
        const pc = msg.restart && pcRef.current ? pcRef.current : createPeer();
        await pc.setRemoteDescription(msg.sdp);
        for (const c of pendingCandidates.current.splice(0)) await pc.addIceCandidate(c);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send({ type: "answer", sdp: pc.localDescription!.toJSON() });
        setPhase((p) => (p === "connected" ? p : "connecting"));
      } else if (msg.type === "answer" && role === "doctor") {
        const pc = pcRef.current;
        if (pc?.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(msg.sdp);
          for (const c of pendingCandidates.current.splice(0)) await pc.addIceCandidate(c);
        }
      } else if (msg.type === "candidate") {
        const pc = pcRef.current;
        if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate);
        else pendingCandidates.current.push(msg.candidate);
      } else if (msg.type === "bye") {
        teardownPeer();
        setPhase("waiting");
      }
    } catch (e) {
      console.warn("signalling error", (e as Error).name);
    }
  }, [createPeer, role, selfId, send, teardownPeer]);

  const stopAll = useCallback(() => {
    teardownPeer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  }, [supabase, teardownPeer]);

  async function start() {
    setError(null);
    setPhase("media");
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: mode === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      });
    } catch (e) {
      setPhase("idle");
      setError(MEDIA_ERRORS[(e as Error).name] ?? "Could not access your camera or microphone.");
      return;
    }
    if (localVideo.current && mode === "video") localVideo.current.srcObject = streamRef.current;

    await supabase.realtime.setAuth();
    const channel = supabase.channel(`consult:${appointmentId}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: selfId } },
    });
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "signal" }, ({ payload }) => handleSignal(payload as Signal))
      .on("presence", { event: "sync" }, () => {
        const others = Object.keys(channel.presenceState()).filter((k) => k !== selfId);
        setPeerPresent(others.length > 0);
        const pc = pcRef.current;
        if (role === "doctor" && others.length > 0 && (!pc || pc.connectionState === "closed" || pc.connectionState === "failed")) call();
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (key !== selfId) {
          teardownPeer();
          setPhase("waiting");
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role, joined_at: Date.now() });
          setPhase((p) => (p === "media" ? "waiting" : p));
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("Lost connection to the consultation service. Reconnecting…");
        }
      });
  }

  function leave() {
    send({ type: "bye" });
    stopAll();
    setPhase("ended");
  }

  // Release camera/mic and signalling when the component unmounts or the route is hidden.
  useEffect(() => stopAll, [stopAll]);

  useEffect(() => {
    if (phase !== "connected" && phase !== "reconnecting") return;
    const t = setInterval(() => connectedAt.current && setSeconds(Math.floor((Date.now() - connectedAt.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };
  const toggleCamera = () => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = cameraOff));
    setCameraOff(!cameraOff);
  };

  const label: Record<Phase, string> = {
    idle: "Not joined",
    media: "Requesting camera/microphone…",
    waiting: peerPresent ? "Connecting…" : role === "doctor" ? "Waiting for the patient to join…" : "Waiting for the doctor to join…",
    connecting: "Connecting…",
    connected: "Connected",
    reconnecting: "Connection unstable, reconnecting…",
    failed: "Connection failed",
    ended: "You left the call",
  };
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex h-full flex-col bg-slate-900 text-white">
      <div className="flex items-center justify-between px-4 py-2 text-xs">
        <span role="status" className="inline-flex items-center gap-2">
          <span className={cn("size-2 rounded-full", phase === "connected" ? "bg-emerald-400" : phase === "failed" ? "bg-red-400" : "bg-amber-400")} />
          {label[phase]}
        </span>
        {(phase === "connected" || phase === "reconnecting") && <span className="tabular-nums" aria-label="Call duration">{duration}</span>}
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {mode === "video" ? (
          <>
            <video ref={remoteVideo} autoPlay playsInline className="size-full object-contain" aria-label="Remote video" />
            <video ref={localVideo} autoPlay playsInline muted className={cn("absolute bottom-3 right-3 w-32 rounded-lg border border-white/20 bg-black object-cover sm:w-48", cameraOff && "opacity-30")} aria-label="Your camera preview" />
          </>
        ) : (
          <div className="text-center">
            <div className={cn("mx-auto flex size-24 items-center justify-center rounded-full bg-white/10", phase === "connected" && "animate-pulse")}><Mic className="size-10" aria-hidden /></div>
            <p className="mt-3 text-sm text-white/70">Audio consultation</p>
          </div>
        )}
        <audio ref={remoteAudio} autoPlay className="hidden" />
        {(phase === "idle" || phase === "ended" || phase === "failed") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-6 text-center">
            {error && <Alert tone="danger" className="max-w-md text-left">{error}</Alert>}
            {phase !== "failed" ? (
              <Button onClick={start} size="lg">{phase === "ended" ? "Rejoin call" : `Join ${mode} call`}</Button>
            ) : (
              <Button onClick={() => { stopAll(); failures.current = 0; start(); }} size="lg" variant="secondary">Try again</Button>
            )}
            <p className="max-w-sm text-xs text-white/60">Calls are encrypted end-to-end by your browser (DTLS-SRTP) and are never recorded.</p>
          </div>
        )}
        {phase === "media" && <Loader2 className="absolute size-8 animate-spin" aria-label="Starting" />}
      </div>

      {phase !== "idle" && phase !== "ended" && (
        <div className="flex items-center justify-center gap-3 p-3">
          <Button variant="secondary" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"}>
            {muted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
          </Button>
          {mode === "video" && (
            <Button variant="secondary" onClick={toggleCamera} aria-pressed={cameraOff} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}>
              {cameraOff ? <VideoOff className="size-4" aria-hidden /> : <Video className="size-4" aria-hidden />}
            </Button>
          )}
          <Button variant="danger" onClick={leave} aria-label="Leave call"><PhoneOff className="size-4" aria-hidden /> Leave</Button>
        </div>
      )}
    </div>
  );
}
