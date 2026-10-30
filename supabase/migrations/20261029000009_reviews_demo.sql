-- Verified patient reviews, rating aggregates, and flags for removable demo data.
-- Reviews are written only through submit_review() and moderated only through moderate_review().

-- ---------------------------------------------------------------------------
-- Demo flags. profiles.is_demo is the cleanup key; doctor_profiles.is_demo drives the public "Demo" badge
-- (profiles is not publicly readable).
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_demo boolean not null default false;
alter table public.doctor_profiles add column is_demo boolean not null default false;

-- Demo and real accounts never share an appointment: real patients can't pay fictional doctors, and
-- cleanup never has to choose between keeping demo rows and deleting real ones.
create function public.guard_demo_appointment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_demo boolean := (select is_demo from public.profiles where id = new.doctor_id);
  v_patient_demo boolean := (select is_demo from public.profiles where id = new.patient_id);
begin
  if v_doctor_demo and not v_patient_demo then
    raise exception 'DEMO_DOCTOR_NOT_BOOKABLE' using errcode = 'P0001';
  end if;
  if v_patient_demo and not v_doctor_demo then
    raise exception 'DEMO_PATIENT_REAL_DOCTOR' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger appointments_demo_guard before insert or update of patient_id, doctor_id on public.appointments
  for each row execute function public.guard_demo_appointment();

-- Nothing is ever emailed to a demo account or the reserved demo domain (reminders, receipts, sweeps).
create function public.drop_demo_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.to_email ilike '%@demo.docothink.test'
     or exists (select 1 from public.profiles where id = new.to_user_id and is_demo) then
    return null;
  end if;
  return new;
end;
$$;
create trigger email_outbox_drop_demo before insert on public.email_outbox
  for each row execute function public.drop_demo_email();

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
alter table public.admin_permissions drop constraint admin_permissions_permission_check;
alter table public.admin_permissions add constraint admin_permissions_permission_check check (permission in (
  '*', 'doctors.manage', 'patients.manage', 'appointments.manage', 'finance.manage',
  'settings.manage', 'clinical.read', 'audit.read', 'reviews.manage'
));

alter table public.doctor_profiles
  add column rating_avg numeric(3, 2),
  add column rating_count integer not null default 0 check (rating_count >= 0);

create table public.doctor_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  doctor_id uuid not null references public.doctor_profiles (user_id),
  patient_id uuid not null references public.patient_profiles (user_id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  is_anonymous boolean not null default false,
  comment_status text not null default 'none' check (comment_status in ('none', 'pending', 'approved', 'hidden')),
  moderated_by uuid references public.profiles (id),
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  check ((comment is null) = (comment_status = 'none'))
);
create index doctor_reviews_doctor_idx on public.doctor_reviews (doctor_id, created_at desc);
create index doctor_reviews_pending_idx on public.doctor_reviews (created_at) where comment_status = 'pending';

-- Stars count whatever the comment's moderation state: moderation acts on text only.
create function public.refresh_doctor_rating(p_doctor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.doctor_profiles d
  set rating_count = s.n, rating_avg = case when s.n = 0 then null else round(s.avg, 2) end
  from (select count(*)::integer as n, avg(rating) as avg from public.doctor_reviews where doctor_id = p_doctor) s
  where d.user_id = p_doctor
$$;

create function public.doctor_reviews_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.refresh_doctor_rating(new.doctor_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and (tg_op = 'DELETE' or old.doctor_id <> new.doctor_id) then
    perform public.refresh_doctor_rating(old.doctor_id);
  end if;
  return null;
end;
$$;

create trigger doctor_reviews_aggregate after insert or update or delete on public.doctor_reviews
  for each row execute function public.doctor_reviews_aggregate();

create function public.submit_review(
  p_appointment uuid,
  p_rating smallint,
  p_comment text,
  p_anonymous boolean default false
)
returns public.doctor_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.appointments;
  v_comment text := nullif(trim(p_comment), '');
  v_review public.doctor_reviews;
begin
  select * into v_a from public.appointments where id = p_appointment;
  if not found or v_a.patient_id is distinct from auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'INVALID_RATING' using errcode = 'P0001';
  end if;
  if v_a.status <> 'completed' or v_a.end_at < now() - interval '30 days' then
    raise exception 'REVIEW_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if char_length(v_comment) > 1000 then
    raise exception 'COMMENT_TOO_LONG' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.doctor_reviews where appointment_id = p_appointment) then
    raise exception 'REVIEW_EXISTS' using errcode = 'P0001';
  end if;

  insert into public.doctor_reviews (appointment_id, doctor_id, patient_id, rating, comment, is_anonymous, comment_status)
  values (v_a.id, v_a.doctor_id, v_a.patient_id, p_rating, v_comment, coalesce(p_anonymous, false),
          case when v_comment is null then 'none' else 'pending' end)
  returning * into v_review;
  if v_comment is not null then
    perform public.notify_admins('reviews.manage', 'review-pending:' || v_review.id::text,
      'Review awaiting moderation', 'A patient left a comment that needs checking before it is published.',
      '/admin/reviews');
  end if;
  return v_review;
end;
$$;

create function public.moderate_review(p_review uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('reviews.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'hidden') then
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
  update public.doctor_reviews
  set comment_status = p_status, moderated_by = auth.uid(), moderated_at = now()
  where id = p_review and comment_status <> 'none';
  if not found then
    raise exception 'REVIEW_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform public.audit('review.moderate', 'review', p_review::text, jsonb_build_object('status', p_status));
end;
$$;

-- Public face of reviews: approved comments only, never the patient id, and a name only beside a
-- published comment (a bare star rating must not tie a named person to a specialty). Dates are day-level.
create view public.public_doctor_reviews
with (security_invoker = false) as
select
  r.id,
  r.doctor_id,
  r.rating,
  case when r.comment_status = 'approved' then r.comment end as comment,
  case
    when r.is_anonymous then 'Anonymous patient'
    when r.comment_status <> 'approved' then 'Verified patient'
    when position(' ' in trim(coalesce(p.full_name, ''))) = 0 then coalesce(nullif(trim(p.full_name), ''), 'Verified patient')
    else split_part(trim(p.full_name), ' ', 1) || ' ' || upper(left(regexp_replace(trim(p.full_name), '^.*\s+', ''), 1)) || '.'
  end as reviewer_name,
  r.created_at::date as created_at
from public.doctor_reviews r
join public.profiles p on p.id = r.patient_id
join public.doctor_profiles d on d.user_id = r.doctor_id and d.application_status = 'approved';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- Supabase's default privileges grant client roles everything on new relations; start from nothing.
revoke all on public.doctor_reviews, public.public_doctor_reviews from anon, authenticated;

alter table public.doctor_reviews enable row level security;
grant select on public.doctor_reviews to authenticated;
create policy doctor_reviews_select on public.doctor_reviews for select to authenticated
  using (patient_id = auth.uid() or public.is_admin());

grant select on public.public_doctor_reviews to anon, authenticated;

revoke execute on function public.refresh_doctor_rating(uuid), public.doctor_reviews_aggregate()
  from public, anon, authenticated;
revoke execute on function public.submit_review(uuid, smallint, text, boolean), public.moderate_review(uuid, text)
  from public, anon;
grant execute on function public.submit_review(uuid, smallint, text, boolean), public.moderate_review(uuid, text)
  to authenticated;
