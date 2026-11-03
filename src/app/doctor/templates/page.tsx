import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { ButtonLink, Card, EmptyState, PageHeader, Table, buttonClasses } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ui/form-client";
import { requireApprovedDoctor } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { deleteTemplateAction } from "@/features/prescriptions/actions";
import { TemplateForm } from "@/features/prescriptions/components/template-form";
import type { Template } from "@/features/prescriptions/templates";

const COLUMNS = "id, name, items, treatment_plan, advice, follow_up";

export default async function DoctorTemplatesPage({ searchParams }: PageProps<"/doctor/templates">) {
  const viewer = await requireApprovedDoctor();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.from("prescription_templates").select(COLUMNS).eq("doctor_id", viewer.id).order("name");
  if (error) throw new Error("Could not load templates");
  const templates = data as Template[];

  const creating = sp.new === "1";
  const editing = typeof sp.edit === "string" ? templates.find((t) => t.id === sp.edit) : undefined;
  if (typeof sp.edit === "string" && !editing) notFound();

  if (creating || editing) {
    return (
      <>
        <PageHeader title={editing ? `Edit ${editing.name}` : "New template"} description="Fills a draft prescription in one step. You still review and sign every prescription." />
        <Card className="p-5"><TemplateForm key={editing?.id ?? "new"} template={editing ?? null} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Rx templates"
        description="Your own reusable medicines and advice. Only you can see them."
        actions={<ButtonLink href="/doctor/templates?new=1" size="sm">New template</ButtonLink>}
      />
      <Card>
        {templates.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" aria-hidden />}
            title="No templates yet"
            description="Save the prescriptions you write often, then apply them in one step."
          />
        ) : (
          <Table>
            <thead><tr><th>Name</th><th className="text-right">Medicines</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium text-slate-900">{t.name}</td>
                  <td className="text-right tabular-nums">{t.items.length}</td>
                  <td>
                    <div className="flex justify-end gap-2">
                      <Link href={`/doctor/templates?edit=${t.id}`} className={buttonClasses("secondary", "sm")}>Edit</Link>
                      <form action={deleteTemplateAction}>
                        <input type="hidden" name="template_id" value={t.id} />
                        <ConfirmSubmit variant="ghost" size="sm" message={`Delete the template "${t.name}"? Prescriptions already written aren't affected.`}>Delete</ConfirmSubmit>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
