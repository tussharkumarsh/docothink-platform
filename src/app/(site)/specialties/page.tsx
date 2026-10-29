import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Stethoscope } from "lucide-react";
import { getSpecialties } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Medical specialties" };

export default async function SpecialtiesPage() {
  const specialties = await getSpecialties();
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Medical specialties</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Not sure where to start? Choose General Medicine and the doctor will guide you to the right specialist.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {specialties.map((s) => (
          <Link
            key={s.id}
            href={`/doctors?specialty=${s.slug}`}
            className="flex gap-4 rounded-card border border-slate-200 p-5 transition hover:border-brand-200 hover:bg-brand-50/40"
          >
            {s.icon_path ? <Image src={s.icon_path} alt="" width={48} height={48} className="shrink-0" /> : <Stethoscope className="size-12 text-brand-600" aria-hidden />}
            <span>
              <span className="block font-medium text-slate-900">{s.name}</span>
              {s.description && <span className="mt-1 block text-sm text-slate-600">{s.description}</span>}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
