import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Languages, MessageSquare, Phone, Star, Video } from "lucide-react";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { InitialsAvatar } from "@/components/ui/avatar";
import { formatRating } from "../discovery";
import { formatMoney } from "@/lib/money";
import { photoUrl, type DoctorCard as Doctor } from "../queries";
import type { ConsultationMode } from "@/lib/domain";

const MODE_ICONS: Record<ConsultationMode, typeof Video> = { chat: MessageSquare, audio: Phone, video: Video };

export function feesOf(doctor: Pick<Doctor, "fee_chat" | "fee_audio" | "fee_video">) {
  return (["chat", "audio", "video"] as const)
    .map((mode) => ({ mode, fee: doctor[`fee_${mode}`] }))
    .filter((f): f is { mode: ConsultationMode; fee: number } => f.fee != null);
}

export function DoctorCard({ doctor, nextAvailable }: { doctor: Doctor; nextAvailable?: string | null }) {
  const fees = feesOf(doctor);
  const from = fees.length ? Math.min(...fees.map((f) => f.fee)) : null;
  const primary = doctor.specialties[0];
  const rating = formatRating(doctor.rating_avg, doctor.rating_count);
  return (
    <Card className="flex h-full flex-col p-6 transition-shadow duration-200 hover:shadow-card-hover">
      <div className="flex gap-4">
        {doctor.photo_path ? (
          <Image
            src={photoUrl(doctor.photo_path)}
            alt=""
            width={72}
            height={72}
            className="size-18 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
          />
        ) : (
          <InitialsAvatar name={doctor.display_name} size={72} />
        )}
        <div className="min-w-0">
          <Link href={`/doctors/${doctor.slug}`} className="font-semibold text-slate-900 hover:text-brand-700">
            {doctor.title} {doctor.display_name}
          </Link>
          <p className="text-sm text-brand-700">{primary?.name ?? doctor.headline}</p>
          {rating && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-700">
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="sr-only">Rated</span> {rating}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-slate-500">{doctor.qualifications}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="success">
              <BadgeCheck className="size-3" aria-hidden /> Verified
            </Badge>
            {doctor.years_experience != null && <Badge>{doctor.years_experience} yrs experience</Badge>}
            {doctor.is_demo && <Badge tone="warning">Demo</Badge>}
          </div>
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm text-slate-600">
        {doctor.languages.length > 0 && (
          <div className="flex items-center gap-2">
            <Languages className="size-4 text-slate-400" aria-hidden />
            <dt className="sr-only">Languages</dt>
            <dd>{doctor.languages.join(", ")}</dd>
          </div>
        )}
        <div className="flex items-center gap-2">
          <dt className="sr-only">Consultation modes</dt>
          <dd className="flex gap-2">
            {fees.map(({ mode }) => {
              const Icon = MODE_ICONS[mode];
              return (
                <span key={mode} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs capitalize">
                  <Icon className="size-3.5" aria-hidden /> {mode}
                </span>
              );
            })}
          </dd>
        </div>
        {nextAvailable !== undefined && (
          <div>
            <dt className="sr-only">Next available</dt>
            <dd className="text-xs">
              {nextAvailable ? <span className="text-accent-600">Next available: {nextAvailable}</span> : "No open slots this week"}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <p className="text-sm">
          {from != null ? (
            <>
              <span className="text-slate-500">From </span>
              <span className="font-semibold text-slate-900">{formatMoney(from, doctor.currency)}</span>
            </>
          ) : (
            <span className="text-slate-500">Fees not set</span>
          )}
        </p>
        <div className="flex gap-2">
          <ButtonLink href={`/doctors/${doctor.slug}`} variant="secondary" size="sm">
            View profile
          </ButtonLink>
          <ButtonLink href={`/doctors/${doctor.slug}#book`} size="sm">
            Book
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}
