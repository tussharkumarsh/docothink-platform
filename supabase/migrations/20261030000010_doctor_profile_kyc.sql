-- Doctor professional details (public), private address/bank/tax details (doctor + finance admins only),
-- verification of those details, masked admin reads and audited reveal.

-- ---------------------------------------------------------------------------
-- Public professional details
-- ---------------------------------------------------------------------------
create function public.text_items_ok(p_items text[], p_max_items integer, p_max_len integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_items), 0) <= p_max_items
     and not exists (select 1 from unnest(coalesce(p_items, '{}')) i where char_length(i) > p_max_len or char_length(trim(i)) = 0)
$$;

alter table public.doctor_profiles
  add column special_interests text[] not null default '{}' check (public.text_items_ok(special_interests, 15, 80)),
  add column services text[] not null default '{}' check (public.text_items_ok(services, 40, 120)),
  add column skills text[] not null default '{}' check (public.text_items_ok(skills, 30, 80)),
  add column awards jsonb not null default '[]' check (jsonb_typeof(awards) = 'array' and jsonb_array_length(awards) <= 20),
  add column memberships jsonb not null default '[]' check (jsonb_typeof(memberships) = 'array' and jsonb_array_length(memberships) <= 20),
  add column publications jsonb not null default '[]' check (jsonb_typeof(publications) = 'array' and jsonb_array_length(publications) <= 30),
  add column practice_started_year smallint check (practice_started_year between 1950 and 2100);

grant update (special_interests, services, skills, awards, memberships, publications, practice_started_year)
  on public.doctor_profiles to authenticated;

-- Bank proof (cancelled cheque / statement) reuses the credential upload and review flow.
alter type public.credential_kind add value if not exists 'bank_proof';

-- ---------------------------------------------------------------------------
-- Private details
-- ---------------------------------------------------------------------------
create type public.kyc_status as enum ('not_submitted', 'pending', 'verified', 'changes_requested');

create table public.doctor_private_details (
  doctor_id uuid primary key references public.doctor_profiles (user_id) on delete cascade,
  address_line1 text check (char_length(address_line1) <= 200),
  address_line2 text check (char_length(address_line2) <= 200),
  city text check (char_length(city) <= 100),
  region text check (char_length(region) <= 100),
  postal_code text check (char_length(postal_code) <= 20),
  country char(2),
  account_holder_name text check (char_length(account_holder_name) <= 200),
  bank_name text check (char_length(bank_name) <= 200),
  bank_country char(2) check (bank_country in ('IN', 'GB', 'US')),
  account_number text,
  ifsc text,
  sort_code text,
  routing_number text,
  account_type text check (account_type in ('checking', 'savings')),
  pan text,
  gstin text,
  tax_id text,
  kyc_status public.kyc_status not null default 'not_submitted',
  kyc_note text check (char_length(kyc_note) <= 1000),
  verified_by uuid references public.profiles (id),
  verified_at timestamptz,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
create trigger doctor_private_details_updated_at before update on public.doctor_private_details
  for each row execute function public.set_updated_at();

-- Doctor saves address and/or bank+tax details. Validates per bank country; any change to bank or tax
-- fields sends the details back for verification (a compromised login can't silently redirect payouts).
create function public.save_private_details(p jsonb)
returns public.kyc_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_old public.doctor_private_details;
  v_new public.doctor_private_details;
  v_ctry text;
  v_complete boolean;
  v_changed boolean;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'doctor' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- Trim everything; empty strings become null; codes are upper-cased.
  select coalesce(jsonb_object_agg(key, case
           when key in ('ifsc', 'pan', 'gstin', 'country', 'bank_country') then to_jsonb(upper(nullif(trim(value #>> '{}'), '')))
           when key in ('account_number', 'sort_code', 'routing_number', 'tax_id') then to_jsonb(nullif(regexp_replace(value #>> '{}', '[\s-]', '', 'g'), ''))
           else to_jsonb(nullif(trim(value #>> '{}'), '')) end), '{}'::jsonb)
  into v from jsonb_each(coalesce(p, '{}'::jsonb));
  v_ctry := v ->> 'bank_country';

  if v_ctry is not null and v_ctry not in ('IN', 'GB', 'US') then
    raise exception 'INVALID_BANK_COUNTRY' using errcode = 'P0001';
  end if;
  if (v_ctry is distinct from 'IN' and (v ->> 'ifsc' is not null or v ->> 'pan' is not null or v ->> 'gstin' is not null))
     or (v_ctry is distinct from 'GB' and v ->> 'sort_code' is not null)
     or (v_ctry is distinct from 'US' and (v ->> 'routing_number' is not null or v ->> 'account_type' is not null or v ->> 'tax_id' is not null)) then
    raise exception 'MISMATCHED_FIELDS' using errcode = 'P0001';
  end if;
  if v ->> 'account_number' is not null and (v_ctry is null or v ->> 'account_number' !~ case v_ctry
       when 'IN' then '^[0-9]{9,18}$' when 'GB' then '^[0-9]{8}$' else '^[0-9]{4,17}$' end) then
    raise exception 'INVALID_ACCOUNT_NUMBER' using errcode = 'P0001';
  end if;
  if v ->> 'ifsc' !~ '^[A-Z]{4}0[A-Z0-9]{6}$' then raise exception 'INVALID_IFSC' using errcode = 'P0001'; end if;
  if v ->> 'pan' !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then raise exception 'INVALID_PAN' using errcode = 'P0001'; end if;
  if v ->> 'gstin' !~ '^[0-9]{2}[A-Z0-9]{13}$' then raise exception 'INVALID_GSTIN' using errcode = 'P0001'; end if;
  if v ->> 'sort_code' !~ '^[0-9]{6}$' then raise exception 'INVALID_SORT_CODE' using errcode = 'P0001'; end if;
  if v ->> 'routing_number' !~ '^[0-9]{9}$' then raise exception 'INVALID_ROUTING_NUMBER' using errcode = 'P0001'; end if;
  if v ->> 'tax_id' !~ '^[0-9]{9}$' then raise exception 'INVALID_TAX_ID' using errcode = 'P0001'; end if;
  if v ->> 'account_type' not in ('checking', 'savings') then raise exception 'INVALID_ACCOUNT_TYPE' using errcode = 'P0001'; end if;
  if v ->> 'country' !~ '^[A-Z]{2}$' then raise exception 'INVALID_COUNTRY' using errcode = 'P0001'; end if;

  select * into v_old from public.doctor_private_details where doctor_id = auth.uid() for update;

  v_new := jsonb_populate_record(null::public.doctor_private_details, v);
  v_changed := (v_old.doctor_id is null and v_ctry is not null)
    or v_new.account_holder_name is distinct from v_old.account_holder_name
    or v_new.bank_name is distinct from v_old.bank_name
    or v_new.bank_country is distinct from v_old.bank_country
    or v_new.account_number is distinct from v_old.account_number
    or v_new.ifsc is distinct from v_old.ifsc
    or v_new.sort_code is distinct from v_old.sort_code
    or v_new.routing_number is distinct from v_old.routing_number
    or v_new.account_type is distinct from v_old.account_type
    or v_new.pan is distinct from v_old.pan
    or v_new.gstin is distinct from v_old.gstin
    or v_new.tax_id is distinct from v_old.tax_id;
  v_complete := v_new.account_holder_name is not null and v_new.bank_name is not null and v_new.account_number is not null and case v_ctry
    when 'IN' then v_new.ifsc is not null and v_new.pan is not null
    when 'GB' then v_new.sort_code is not null
    when 'US' then v_new.routing_number is not null and v_new.account_type is not null and v_new.tax_id is not null
    else false end;
  -- After "changes requested", saving complete details resubmits them even if nothing changed
  -- (e.g. the doctor only uploaded a clearer bank proof).
  v_changed := v_changed or (v_old.kyc_status = 'changes_requested' and v_complete);

  insert into public.doctor_private_details as d (
    doctor_id, address_line1, address_line2, city, region, postal_code, country,
    account_holder_name, bank_name, bank_country, account_number, ifsc, sort_code, routing_number, account_type,
    pan, gstin, tax_id, kyc_status, submitted_at)
  values (
    auth.uid(), v_new.address_line1, v_new.address_line2, v_new.city, v_new.region, v_new.postal_code, v_new.country,
    v_new.account_holder_name, v_new.bank_name, v_new.bank_country, v_new.account_number, v_new.ifsc, v_new.sort_code,
    v_new.routing_number, v_new.account_type, v_new.pan, v_new.gstin, v_new.tax_id,
    case when v_changed then case when v_complete then 'pending' else 'not_submitted' end::public.kyc_status
         else coalesce(v_old.kyc_status, 'not_submitted') end,
    case when v_changed and v_complete then now() else v_old.submitted_at end)
  on conflict (doctor_id) do update set
    address_line1 = excluded.address_line1, address_line2 = excluded.address_line2, city = excluded.city,
    region = excluded.region, postal_code = excluded.postal_code, country = excluded.country,
    account_holder_name = excluded.account_holder_name, bank_name = excluded.bank_name, bank_country = excluded.bank_country,
    account_number = excluded.account_number, ifsc = excluded.ifsc, sort_code = excluded.sort_code,
    routing_number = excluded.routing_number, account_type = excluded.account_type, pan = excluded.pan,
    gstin = excluded.gstin, tax_id = excluded.tax_id, kyc_status = excluded.kyc_status, submitted_at = excluded.submitted_at,
    kyc_note = case when v_changed then null else d.kyc_note end,
    verified_by = case when v_changed then null else d.verified_by end,
    verified_at = case when v_changed then null else d.verified_at end
  returning d.* into v_new;

  if v_changed and v_complete then
    perform public.notify_admins('finance.manage', 'kyc-pending:' || auth.uid()::text || ':' || extract(epoch from now())::bigint,
      'Bank details awaiting verification', 'A doctor submitted new bank and tax details.',
      '/admin/doctors/' || auth.uid()::text);
  end if;
  return v_new.kyc_status;
end;
$$;

-- p_expected_submitted_at is the submission the admin reviewed; details changed since then are refused
-- (an attacker editing bank details while the admin has the page open must not get them verified).
create function public.review_private_details(p_doctor uuid, p_decision text, p_note text, p_expected_submitted_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(trim(p_note), '');
  v_row public.doctor_private_details;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_decision not in ('verify', 'request_changes') then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if p_decision = 'request_changes' and v_note is null then
    raise exception 'NOTE_REQUIRED' using errcode = 'P0001';
  end if;
  select * into v_row from public.doctor_private_details where doctor_id = p_doctor for update;
  if not found or v_row.kyc_status <> 'pending' then
    raise exception 'NOT_PENDING' using errcode = 'P0001';
  end if;
  if v_row.submitted_at is distinct from p_expected_submitted_at then
    raise exception 'STALE_DETAILS' using errcode = 'P0001';
  end if;
  update public.doctor_private_details
  set kyc_status = case when p_decision = 'verify' then 'verified' else 'changes_requested' end::public.kyc_status,
      kyc_note = case when p_decision = 'verify' then null else left(v_note, 1000) end,
      verified_by = case when p_decision = 'verify' then auth.uid() end,
      verified_at = case when p_decision = 'verify' then now() end
  where doctor_id = p_doctor;
  perform public.audit('kyc.review', 'doctor', p_doctor::text, jsonb_build_object('decision', p_decision));
  perform public.enqueue_notification(p_doctor, null, 'kyc-review:' || gen_random_uuid()::text, '{}'::jsonb,
    case when p_decision = 'verify' then 'Bank details verified' else 'Changes needed to your bank details' end,
    case when p_decision = 'verify' then 'You can now raise settlement invoices.' else v_note end,
    '/doctor/profile?tab=bank');
end;
$$;

-- Finance admins see masked values only; full numbers need reveal_bank_details() (audited).
create view public.admin_doctor_bank_masked
with (security_invoker = false) as
select
  d.doctor_id, d.address_line1, d.address_line2, d.city, d.region, d.postal_code, d.country,
  d.account_holder_name, d.bank_name, d.bank_country,
  case when d.account_number is not null then '••••' || right(d.account_number, 4) end as account_masked,
  d.ifsc, d.sort_code,
  case when d.routing_number is not null then '•••••' || right(d.routing_number, 4) end as routing_masked,
  d.account_type,
  case when d.pan is not null then left(d.pan, 2) || '••••' || right(d.pan, 2) end as pan_masked,
  d.gstin,
  case when d.tax_id is not null then '•••••' || right(d.tax_id, 4) end as tax_id_masked,
  d.kyc_status, d.kyc_note, d.submitted_at, d.verified_at
from public.doctor_private_details d
where public.has_permission('finance.manage');

create function public.reveal_bank_details(p_doctor uuid)
returns table (account_number text, routing_number text, pan text, tax_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  perform public.audit('bank.reveal', 'doctor', p_doctor::text, '{}'::jsonb);
  return query
  select d.account_number, d.routing_number, d.pan, d.tax_id from public.doctor_private_details d where d.doctor_id = p_doctor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access (Supabase default privileges grant client roles everything on new relations; start from nothing)
-- ---------------------------------------------------------------------------
revoke all on public.doctor_private_details, public.admin_doctor_bank_masked from anon, authenticated;
alter table public.doctor_private_details enable row level security;
grant select on public.doctor_private_details to authenticated;
create policy doctor_private_details_own on public.doctor_private_details for select to authenticated
  using (doctor_id = auth.uid());
grant select on public.admin_doctor_bank_masked to authenticated;

revoke execute on function public.save_private_details(jsonb), public.review_private_details(uuid, text, text, timestamptz),
  public.reveal_bank_details(uuid) from public, anon;
grant execute on function public.save_private_details(jsonb), public.review_private_details(uuid, text, text, timestamptz),
  public.reveal_bank_details(uuid) to authenticated;
grant execute on function public.text_items_ok(text[], integer, integer) to anon, authenticated;

-- Bank proof shows the full account number: among admins, only finance staff may see it.
-- (Compared as text: an enum value added in this migration can't be used as a literal in the same transaction.)
drop policy doctor_credentials_select on public.doctor_credentials;
create policy doctor_credentials_select on public.doctor_credentials for select to authenticated using (
  doctor_id = auth.uid()
  or (kind::text <> 'bank_proof' and public.has_permission('doctors.manage'))
  or (kind::text = 'bank_proof' and public.has_permission('finance.manage'))
);
