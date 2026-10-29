import { Badge, Card, CardHeader, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/ui/form-client";
import { requirePermission } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { saveSpecialtyAction } from "@/features/admin/actions";

function SpecialtyFields({ s }: { s?: { id: string; name: string; slug: string; description: string | null; sort_order: number; is_active: boolean } }) {
  const p = s?.id ?? "new";
  return (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor={`name-${p}`}><Input id={`name-${p}`} name="name" defaultValue={s?.name} required /></Field>
        <Field label="Slug" htmlFor={`slug-${p}`}><Input id={`slug-${p}`} name="slug" defaultValue={s?.slug} required /></Field>
        <Field label="Order" htmlFor={`order-${p}`}><Input id={`order-${p}`} name="sort_order" type="number" defaultValue={s?.sort_order ?? 0} /></Field>
      </div>
      <Field label="Description" htmlFor={`desc-${p}`}><Textarea id={`desc-${p}`} name="description" rows={2} defaultValue={s?.description ?? ""} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={s?.is_active ?? true} /> Active (visible to patients)</label>
    </>
  );
}

export default async function SpecialtiesAdminPage() {
  await requirePermission("settings.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("specialties").select("id, name, slug, description, sort_order, is_active").order("sort_order");
  return (
    <>
      <PageHeader title="Specialties" description="Deactivate rather than delete: existing doctors and appointments keep their references." />
      <Card className="mb-6">
        <CardHeader title="Add specialty" />
        <div className="p-5"><ActionForm action={saveSpecialtyAction} submitLabel="Add specialty"><SpecialtyFields /></ActionForm></div>
      </Card>
      <div className="space-y-3">
        {data?.map((s) => (
          <details key={s.id} className="rounded-card border border-slate-200 bg-white">
            <summary className="flex cursor-pointer items-center justify-between px-5 py-3 text-sm">
              <span className="font-medium text-slate-900">{s.name}</span>
              {s.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
            </summary>
            <div className="border-t border-slate-100 p-5"><ActionForm action={saveSpecialtyAction} submitLabel="Save"><SpecialtyFields s={s} /></ActionForm></div>
          </details>
        ))}
      </div>
    </>
  );
}
