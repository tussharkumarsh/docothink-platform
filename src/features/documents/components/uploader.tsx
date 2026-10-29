"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { confirmMedicalUploadAction, createCredentialUploadAction, createMedicalUploadAction } from "../actions";

/** Uploads straight to storage via a server-issued signed URL, with progress. */
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

type Variant =
  | { kind: "medical"; maxMb: number; appointments?: { id: string; label: string }[] }
  | { kind: "credential" };

export function Uploader(props: Variant) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const maxMb = props.kind === "medical" ? props.maxMb : 10;
  const accept = props.kind === "medical" ? "application/pdf,image/jpeg,image/png,image/webp,image/heic" : "application/pdf,image/jpeg,image/png";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    setMessage(null);
    if (!file) return setMessage({ tone: "danger", text: "Choose a file to upload." });
    if (file.size > maxMb * 1024 * 1024) return setMessage({ tone: "danger", text: `Files must be ${maxMb} MB or smaller.` });
    if (!accept.split(",").includes(file.type)) return setMessage({ tone: "danger", text: "This file type isn't supported." });

    const ticket =
      props.kind === "medical"
        ? await createMedicalUploadAction({
            title: String(form.get("title") || file.name),
            category: String(form.get("category")),
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            appointmentId: (form.get("appointment_id") as string) || undefined,
          })
        : await createCredentialUploadAction({ kind: String(form.get("kind")), fileName: file.name, mimeType: file.type, size: file.size });
    if (!ticket.ok) return setMessage({ tone: "danger", text: ticket.error });

    try {
      setProgress(0);
      await putWithProgress(ticket.signedUrl, file, setProgress);
      if (props.kind === "medical") {
        const confirmed = await confirmMedicalUploadAction(ticket.id);
        if (!confirmed.ok) throw new Error(confirmed.error);
      }
      setMessage({ tone: "success", text: "Uploaded." });
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch (err) {
      setMessage({ tone: "danger", text: (err as Error).message || "Upload failed." });
    } finally {
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {props.kind === "medical" ? (
          <>
            <Field label="Title" htmlFor="title" hint="e.g. Blood test, March 2026"><Input id="title" name="title" maxLength={200} /></Field>
            <Field label="Type" htmlFor="category">
              <Select id="category" name="category" defaultValue="lab_report">
                <option value="lab_report">Lab report</option>
                <option value="imaging">Imaging / scan</option>
                <option value="prescription">Previous prescription</option>
                <option value="discharge_summary">Discharge summary</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            {props.appointments && props.appointments.length > 0 && (
              <Field label="Attach to appointment (optional)" htmlFor="appointment_id" className="sm:col-span-2">
                <Select id="appointment_id" name="appointment_id" defaultValue="">
                  <option value="">Not linked</option>
                  {props.appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </Select>
              </Field>
            )}
          </>
        ) : (
          <Field label="Document type" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue="registration_certificate">
              <option value="registration_certificate">Medical registration certificate</option>
              <option value="medical_degree">Medical degree / qualification</option>
              <option value="identity_document">Identity document (passport, national ID)</option>
              <option value="other">Other supporting document</option>
            </Select>
          </Field>
        )}
        <Field label="File" htmlFor="file" hint={`PDF${props.kind === "medical" ? ", JPEG, PNG, WebP or HEIC" : ", JPEG or PNG"} · up to ${maxMb} MB`}>
          <Input id="file" ref={fileRef} type="file" accept={accept} required />
        </Field>
      </div>
      {progress !== null && (
        <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
          <div className="h-2 rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <Button type="submit" disabled={progress !== null}>
        <UploadCloud className="size-4" aria-hidden /> {progress !== null ? `Uploading ${progress}%` : "Upload"}
      </Button>
    </form>
  );
}
