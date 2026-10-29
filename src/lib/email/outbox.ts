import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv, serverEnv } from "@/lib/env";
import { renderEmail, type EmailContent } from "./templates";

export interface EmailProvider {
  readonly name: string;
  send(message: EmailContent & { to: string; idempotencyKey: string }): Promise<void>;
}

class ResendProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private apiKey: string, private from: string) {}
  async send(m: EmailContent & { to: string; idempotencyKey: string }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": m.idempotencyKey },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}`);
  }
}

/** Development provider: records that an email would be sent, without delivering it or logging its content. */
class ConsoleProvider implements EmailProvider {
  readonly name = "console";
  async send(m: EmailContent & { to: string }) {
    console.info(`[email:console] would send "${m.subject}" to ***@${m.to.split("@")[1] ?? "?"}`);
  }
}

export function getEmailProvider(): EmailProvider {
  const env = serverEnv();
  if (env.emailProvider === "resend" && env.resendApiKey) return new ResendProvider(env.resendApiKey, env.emailFrom);
  return new ConsoleProvider();
}

const MAX_ATTEMPTS = 6;

/**
 * Delivers queued emails. Rows are claimed with a conditional update (pending → sending) so two
 * concurrent runs never send the same email; dedupe_key (unique) already stops duplicate enqueues
 * from retried webhooks. Failures back off exponentially: 2, 4, 8, 16, 32 minutes.
 */
export async function processOutbox(limit = 25): Promise<{ sent: number; failed: number }> {
  const db = createAdminClient();
  const provider = getEmailProvider();
  const { data: due } = await db
    .from("email_outbox")
    .select("id, dedupe_key, to_email, template, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at")
    .limit(limit);

  let sent = 0;
  let failed = 0;
  // Recover rows stuck in "sending" (process crashed mid-send) after 10 minutes.
  await db.from("email_outbox").update({ status: "pending" }).eq("status", "sending").lt("next_attempt_at", new Date(Date.now() - 10 * 60_000).toISOString());

  const { data: branding } = await db.from("platform_settings").select("value").eq("key", "branding").maybeSingle();
  const brand = (branding?.value as { name?: string } | null)?.name ?? "Docothink";

  for (const row of due ?? []) {
    const { data: claimed } = await db.from("email_outbox").update({ status: "sending", next_attempt_at: new Date().toISOString() }).eq("id", row.id).eq("status", "pending").select("id");
    if (!claimed?.length) continue;
    try {
      const content = renderEmail(row.template, row.payload ?? {}, publicEnv.siteUrl, brand);
      await provider.send({ ...content, to: row.to_email, idempotencyKey: row.dedupe_key });
      await db.from("email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq("id", row.id);
      sent++;
    } catch (error) {
      const attempts = row.attempts + 1;
      await db
        .from("email_outbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          last_error: String((error as Error).message).slice(0, 300),
          next_attempt_at: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
        })
        .eq("id", row.id);
      failed++;
    }
  }
  return { sent, failed };
}
