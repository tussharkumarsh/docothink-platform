"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Video } from "lucide-react";
import { Alert, Button } from "@/components/ui";

type State = { status: "idle" } | { status: "starting" } | { status: "testing" } | { status: "error"; message: string };

function describe(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Access blocked. Allow camera and microphone in your browser's address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone found.";
  if (name === "NotReadableError") return "Your camera or microphone is being used by another app. Close it and try again.";
  return "We couldn't start your camera or microphone. Try another browser (Chrome, Edge, Safari or Firefox).";
}

/**
 * Local camera/microphone test before a consultation: live preview plus a mic level meter.
 * Nothing leaves the device; every track and the audio context are released when the test stops.
 */
export function DeviceCheck({ video }: { video: boolean }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const [level, setLevel] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  // Bumped by every start/stop and on unmount, so a permission prompt that resolves late releases its stream.
  const attemptRef = useRef(0);

  function stop() {
    attemptRef.current++;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioRef.current?.close().catch(() => undefined);
    audioRef.current = null;
    setLevel(0);
  }

  useEffect(() => stop, []);

  // The <video> only mounts once testing starts, so attach the stream after that render.
  useEffect(() => {
    if (state.status === "testing" && video && videoRef.current) videoRef.current.srcObject = streamRef.current;
  }, [state.status, video]);

  async function start() {
    stop();
    const attempt = attemptRef.current;
    setState({ status: "starting" });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("unsupported", "NotSupportedError");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      if (attempt !== attemptRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioRef.current = ctx;
      // Created after an await, so Safari may start it suspended.
      void ctx.resume().catch(() => undefined);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const s of samples) sum += ((s - 128) / 128) ** 2;
        setLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 300)));
        frameRef.current = requestAnimationFrame(tick);
      };
      tick();
      setState({ status: "testing" });
    } catch (error) {
      if (attempt !== attemptRef.current) return;
      stop();
      setState({ status: "error", message: describe(error) });
    }
  }

  return (
    <div className="space-y-3">
      {state.status === "error" && <Alert tone="warning">{state.message}</Alert>}
      {state.status === "testing" ? (
        <>
          {video && (
            <video ref={videoRef} muted playsInline autoPlay className="aspect-video w-full rounded-xl bg-slate-900 object-cover" aria-label="Your camera preview" />
          )}
          <div className="flex items-center gap-3">
            <Mic className="size-4 shrink-0 text-slate-500" aria-hidden />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level}>
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${level}%` }} />
            </div>
          </div>
          <p className="text-xs text-slate-500">Speak: the bar should move. {video ? "You should see yourself above." : ""}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => { stop(); setState({ status: "idle" }); }}>Stop test</Button>
        </>
      ) : (
        <Button type="button" variant="secondary" size="sm" onClick={start} disabled={state.status === "starting"}>
          {video ? <Video className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />} Test {video ? "camera & microphone" : "microphone"}
        </Button>
      )}
    </div>
  );
}
