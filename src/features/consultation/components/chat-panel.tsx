"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Loader2, Send } from "lucide-react";
import { Button, cn } from "@/components/ui";
import { getBrowserClient } from "@/lib/supabase/browser";
import { markReadAction } from "../actions";

type Message = {
  id: string;
  client_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  state?: "sending" | "failed";
};

const PAGE = 30;

/**
 * Real-time chat over Postgres + Supabase Realtime (postgres_changes honours RLS, so only the
 * two participants receive events). Messages are de-duplicated by the sender's client_id.
 */
export function ChatPanel({ appointmentId, selfId, timezone, canSend }: { appointmentId: string; selfId: string; timezone: string; canSend: boolean }) {
  const supabase = getBrowserClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const upsert = useCallback((incoming: Message[]) => {
    setMessages((prev) => {
      const byClient = new Map(prev.map((m) => [m.client_id, m]));
      for (const m of incoming) byClient.set(m.client_id, { ...byClient.get(m.client_id), ...m, state: undefined });
      return [...byClient.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  const loadOlder = useCallback(
    async (before?: string) => {
      let q = supabase
        .from("consultation_messages")
        .select("id, client_id, sender_id, body, created_at, read_at")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (before) q = q.lt("created_at", before);
      const { data } = await q;
      if (data) {
        upsert(data as Message[]);
        setHasMore(data.length === PAGE);
      }
    },
    [appointmentId, supabase, upsert],
  );

  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel(`chat:${appointmentId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "consultation_messages", filter: `appointment_id=eq.${appointmentId}` }, (payload) => {
        upsert([payload.new as Message]);
        if ((payload.new as Message).sender_id !== selfId && document.visibilityState === "visible") markReadAction(appointmentId);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultation_messages", filter: `appointment_id=eq.${appointmentId}` }, (payload) => upsert([payload.new as Message]))
      .subscribe((s) => {
        if (!active) return;
        if (s === "SUBSCRIBED") {
          setStatus("live");
          loadOlder(); // catch up on anything missed while disconnected
          markReadAction(appointmentId);
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("offline");
          loadOlder(); // history still loads without realtime
        }
      });
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [appointmentId, selfId, supabase, upsert, loadOlder]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function send(body: string, clientId = crypto.randomUUID()) {
    const optimistic: Message = { id: clientId, client_id: clientId, sender_id: selfId, body, created_at: new Date().toISOString(), read_at: null, state: "sending" };
    setMessages((prev) => [...prev.filter((m) => m.client_id !== clientId), optimistic]);
    const { data, error } = await supabase
      .from("consultation_messages")
      .insert({ appointment_id: appointmentId, sender_id: selfId, client_id: clientId, body })
      .select("id, client_id, sender_id, body, created_at, read_at")
      .single();
    if (error && error.code !== "23505") {
      setMessages((prev) => prev.map((m) => (m.client_id === clientId ? { ...m, state: "failed" } : m)));
    } else if (data) upsert([data as Message]);
  }

  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs">
        <span className="font-medium text-slate-700">Chat</span>
        <span className={cn("inline-flex items-center gap-1", status === "live" ? "text-emerald-600" : status === "offline" ? "text-red-600" : "text-slate-500")} role="status">
          <span className={cn("size-2 rounded-full", status === "live" ? "bg-emerald-500" : status === "offline" ? "bg-red-500" : "bg-slate-400")} />
          {status === "live" ? "Connected" : status === "offline" ? "Reconnecting…" : "Connecting…"}
        </span>
      </div>
      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite" aria-label="Messages">
        {hasMore && (
          <button type="button" className="mx-auto block text-xs text-brand-700 hover:underline" onClick={() => loadOlder(messages[0]?.created_at)}>
            Load earlier messages
          </button>
        )}
        {messages.length === 0 && <p className="text-center text-sm text-slate-400">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === selfId;
          return (
            <div key={m.client_id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-900")}>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={cn("mt-1 flex items-center justify-end gap-1 text-[10px]", mine ? "text-brand-100" : "text-slate-500")}>
                  {timeFmt.format(new Date(m.created_at))}
                  {mine && (m.state === "sending" ? <Loader2 className="size-3 animate-spin" aria-label="Sending" /> : m.state === "failed" ? (
                    <button type="button" className="underline" onClick={() => send(m.body, m.client_id)}>Failed, retry</button>
                  ) : m.read_at ? <CheckCheck className="size-3" aria-label="Read" /> : <Check className="size-3" aria-label="Delivered" />)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      {canSend ? (
        <form
          className="flex gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = draft.trim();
            if (!body) return;
            setDraft("");
            send(body.slice(0, 4000));
          }}
        >
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            maxLength={4000}
            placeholder="Type a message… (Enter to send)"
            className="input-base resize-none"
          />
          <Button type="submit" aria-label="Send" disabled={!draft.trim()}><Send className="size-4" aria-hidden /></Button>
        </form>
      ) : (
        <p className="border-t border-slate-100 p-3 text-center text-xs text-slate-500">Chat is read-only outside the consultation window.</p>
      )}
    </div>
  );
}
