-- Identity, reference data, doctor profiles, platform settings and commission rules.

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Role is never client-writable.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'patient',
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 200),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()-]{6,20}$'),
  timezone text not null default 'UTC' check (public.is_valid_timezone(timezone)),
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  preferred_language text not null default 'en' check (char_length(preferred_language) <= 35),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.admin_permissions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null check (permission in (
    '*', 'doctors.manage', 'patients.manage', 'appointments.manage', 'finance.manage',
    'settings.manage', 'clinical.read', 'audit.read'
  )),
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission)
);

create table public.patient_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  date_of_birth date,
  sex text check (sex is null or sex in ('female', 'male', 'intersex', 'prefer_not_to_say')),
  address_line1 text check (char_length(address_line1) <= 200),
  address_line2 text check (char_length(address_line2) <= 200),
  city text check (char_length(city) <= 100),
  region text check (char_length(region) <= 100),
  postal_code text check (char_length(postal_code) <= 20),
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  emergency_contact_name text check (char_length(emergency_contact_name) <= 200),
  emergency_contact_relationship text check (char_length(emergency_contact_relationship) <= 100),
  emergency_contact_phone text check (emergency_contact_phone is null or emergency_contact_phone ~ '^\+?[0-9 ()-]{6,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger patient_profiles_updated_at before update on public.patient_profiles
  for each row execute function public.set_updated_at();

-- Sectioned questionnaire (structure validated by the app's Zod schema; see
-- src/features/medical-profile/schema.ts). Preserves every legacy questionnaire field.
create table public.patient_medical_profiles (
  patient_id uuid primary key references public.patient_profiles (user_id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  completed_sections text[] not null default '{}',
  version integer not null default 1,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create function public.bump_medical_profile_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger patient_medical_profiles_version before update on public.patient_medical_profiles
  for each row execute function public.bump_medical_profile_version();

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  symbol text not null,
  minor_units smallint not null default 2 check (minor_units between 0 and 3),
  is_active boolean not null default true
);

create table public.specialties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 100),
  description text check (char_length(description) <= 1000),
  icon_path text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger specialties_updated_at before update on public.specialties
  for each row execute function public.set_updated_at();

create table public.conditions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  specialty_id uuid references public.specialties (id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Doctors. Every column here is safe to show publicly once approved; review
-- notes live in doctor_application_events.
-- ---------------------------------------------------------------------------
create table public.doctor_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null default 'Dr.' check (char_length(title) <= 20),
  display_name text not null default '' check (char_length(display_name) <= 200),
  headline text check (char_length(headline) <= 200),
  bio text check (char_length(bio) <= 5000),
  qualifications text check (char_length(qualifications) <= 500),
  years_experience integer check (years_experience between 0 and 80),
  languages text[] not null default '{}',
  country char(2) check (country is null or country ~ '^[A-Z]{2}$'),
  timezone text not null default 'Asia/Kolkata' check (public.is_valid_timezone(timezone)),
  currency char(3) not null default 'INR' references public.currencies (code),
  -- Fees in minor units of `currency`. NULL means the mode is not offered.
  fee_chat bigint check (fee_chat > 0),
  fee_audio bigint check (fee_audio > 0),
  fee_video bigint check (fee_video > 0),
  registration_number text check (char_length(registration_number) <= 100),
  registration_council text check (char_length(registration_council) <= 200),
  registration_country char(2) check (registration_country is null or registration_country ~ '^[A-Z]{2}$'),
  education jsonb not null default '[]'::jsonb check (jsonb_typeof(education) = 'array'),
  experience jsonb not null default '[]'::jsonb check (jsonb_typeof(experience) = 'array'),
  photo_path text,
  application_status public.doctor_application_status not null default 'draft',
  is_accepting_bookings boolean not null default true,
  booking_horizon_days integer not null default 7 check (booking_horizon_days between 1 and 60),
  min_notice_minutes integer not null default 120 check (min_notice_minutes between 0 and 10080),
  terms_accepted_at timestamptz,
  terms_version text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doctor_profiles_status_idx on public.doctor_profiles (application_status);
create trigger doctor_profiles_updated_at before update on public.doctor_profiles
  for each row execute function public.set_updated_at();

create table public.doctor_specialties (
  doctor_id uuid not null references public.doctor_profiles (user_id) on delete cascade,
  specialty_id uuid not null references public.specialties (id) on delete restrict,
  is_primary boolean not null default false,
  primary key (doctor_id, specialty_id)
);
create unique index doctor_specialties_one_primary on public.doctor_specialties (doctor_id) where is_primary;
create index doctor_specialties_specialty_idx on public.doctor_specialties (specialty_id);

create table public.doctor_credentials (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles (user_id) on delete cascade,
  kind public.credential_kind not null,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) <= 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  status public.verification_status not null default 'pending',
  review_note text check (char_length(review_note) <= 2000),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index doctor_credentials_doctor_idx on public.doctor_credentials (doctor_id);

create table public.doctor_application_events (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctor_profiles (user_id) on delete cascade,
  from_status public.doctor_application_status,
  to_status public.doctor_application_status not null,
  actor_id uuid references public.profiles (id),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index doctor_application_events_doctor_idx on public.doctor_application_events (doctor_id, created_at desc);

-- Fee changes are audited (prices are business-critical).
create table public.doctor_fee_history (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.doctor_profiles (user_id) on delete cascade,
  currency char(3) not null,
  fee_chat bigint,
  fee_audio bigint,
  fee_video bigint,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create function public.track_doctor_fee_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.fee_chat is distinct from old.fee_chat
     or new.fee_audio is distinct from old.fee_audio
     or new.fee_video is distinct from old.fee_video
     or new.currency is distinct from old.currency then
    insert into public.doctor_fee_history (doctor_id, currency, fee_chat, fee_audio, fee_video, changed_by)
    values (new.user_id, new.currency, new.fee_chat, new.fee_audio, new.fee_video, auth.uid());
  end if;
  return new;
end;
$$;
create trigger doctor_profiles_fee_history after insert or update on public.doctor_profiles
  for each row execute function public.track_doctor_fee_changes();

-- Registration details are what admins verified; changing them after approval needs a re-review.
create function public.guard_verified_doctor_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.application_status in ('approved', 'suspended')
     and auth.uid() = old.user_id
     and (new.registration_number is distinct from old.registration_number
          or new.registration_council is distinct from old.registration_council
          or new.registration_country is distinct from old.registration_country) then
    raise exception 'REGISTRATION_LOCKED: registration details can only be changed by support after approval'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger doctor_profiles_guard_verified before update on public.doctor_profiles
  for each row execute function public.guard_verified_doctor_fields();

-- ---------------------------------------------------------------------------
-- Platform settings and commission rules
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z_]+$'),
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create function public.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.platform_settings where key = p_key
$$;

-- Append-only; the latest effective row wins. doctor_id NULL = platform default.
create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references public.doctor_profiles (user_id) on delete cascade,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  effective_from timestamptz not null default now(),
  note text check (char_length(note) <= 500),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index commission_rules_lookup on public.commission_rules (doctor_id, effective_from desc);
create trigger commission_rules_immutable before update or delete on public.commission_rules
  for each row execute function public.prevent_mutation();

create function public.effective_commission_bps(p_doctor uuid, p_at timestamptz default now())
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select rate_bps from public.commission_rules
      where doctor_id = p_doctor and effective_from <= p_at
      order by effective_from desc limit 1),
    (select rate_bps from public.commission_rules
      where doctor_id is null and effective_from <= p_at
      order by effective_from desc limit 1),
    1000
  )
$$;

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so RLS policies can call them without recursion)
-- ---------------------------------------------------------------------------
create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid() and is_active), false)
$$;

create function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_permissions ap
    join public.profiles pr on pr.id = ap.user_id
    where ap.user_id = auth.uid()
      and pr.role = 'admin'
      and pr.is_active
      and ap.permission in (p_permission, '*')
  )
$$;

create function public.is_approved_doctor(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doctor_profiles d
    join public.profiles p on p.id = d.user_id
    where d.user_id = p_user and d.application_status = 'approved' and p.is_active
  )
$$;

-- ---------------------------------------------------------------------------
-- New auth user → profile rows. 'doctor' is the only role a user may request;
-- it grants nothing until an admin approves the application. Never 'admin'.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested text := new.raw_user_meta_data ->> 'signup_role';
  v_tz text := new.raw_user_meta_data ->> 'timezone';
  v_name text := left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200);
  v_slug text;
begin
  insert into public.profiles (id, email, full_name, role, timezone)
  values (
    new.id,
    coalesce(new.email, ''),
    v_name,
    case when v_requested = 'doctor' then 'doctor'::public.app_role else 'patient'::public.app_role end,
    case when public.is_valid_timezone(v_tz) then v_tz else 'UTC' end
  );

  if v_requested = 'doctor' then
    v_slug := trim(both '-' from lower(regexp_replace(coalesce(nullif(v_name, ''), 'doctor'), '[^a-zA-Z0-9]+', '-', 'g')));
    if v_slug = '' then
      v_slug := 'doctor';
    end if;
    insert into public.doctor_profiles (user_id, slug, display_name, timezone)
    values (
      new.id,
      left(v_slug, 60) || '-' || substr(replace(new.id::text, '-', ''), 1, 6),
      v_name,
      case when public.is_valid_timezone(v_tz) then v_tz else 'Asia/Kolkata' end
    );
    insert into public.doctor_application_events (doctor_id, to_status, actor_id, note)
    values (new.id, 'draft', new.id, 'Account created');
  else
    insert into public.patient_profiles (user_id) values (new.id);
    insert into public.patient_medical_profiles (patient_id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = coalesce(new.email, '') where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();
