-- Wave 2: a doctor's private, reusable prescription templates. Templates never hold patient-specific fields
-- (symptoms, observations, history, diagnosis) and have no path to a signed prescription.

create table public.prescription_templates (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles (user_id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 20),
  treatment_plan text check (char_length(treatment_plan) <= 5000),
  advice text check (char_length(advice) <= 5000),
  follow_up text check (char_length(follow_up) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index prescription_templates_name on public.prescription_templates (doctor_id, lower(name));
create trigger prescription_templates_updated_at before update on public.prescription_templates
  for each row execute function public.set_updated_at();

create function public.guard_template_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.prescription_templates where doctor_id = new.doctor_id) >= 50 then
    raise exception 'TEMPLATE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_template_limit() from public, anon, authenticated;
create trigger prescription_templates_limit before insert on public.prescription_templates
  for each row execute function public.guard_template_limit();

alter table public.prescription_templates enable row level security;
revoke all on public.prescription_templates from anon, authenticated;
grant select, insert, update, delete on public.prescription_templates to authenticated;

create policy prescription_templates_select_own on public.prescription_templates for select to authenticated
  using (doctor_id = (select auth.uid()));
create policy prescription_templates_insert_own on public.prescription_templates for insert to authenticated
  with check (doctor_id = (select auth.uid()));
create policy prescription_templates_update_own on public.prescription_templates for update to authenticated
  using (doctor_id = (select auth.uid())) with check (doctor_id = (select auth.uid()));
create policy prescription_templates_delete_own on public.prescription_templates for delete to authenticated
  using (doctor_id = (select auth.uid()));
