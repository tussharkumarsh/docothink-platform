-- Wave 1 read-only reports: the admin analytics dashboard (one round trip) and the bulk bank payout file.

-- Admin analytics over [p_from, p_to] (inclusive dates in the admin display zone p_tz). Weekly series start on
-- Mondays in p_tz and include every week in the range (zero when empty). Counts for every admin; money only with
-- finance.manage.
create function public.admin_analytics(p_from date, p_to date, p_tz text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_weeks date[];
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not public.is_valid_timezone(p_tz) then
    raise exception 'INVALID_TIMEZONE' using errcode = 'P0001';
  end if;
  v_from := p_from::timestamp at time zone p_tz;
  v_to := (p_to + 1)::timestamp at time zone p_tz;
  v_weeks := array(select g::date from generate_series(date_trunc('week', p_from::timestamp), date_trunc('week', p_to::timestamp), interval '1 week') g);

  v := jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'bookings', (select count(*) from public.appointments where created_at >= v_from and created_at < v_to),
        'completed', count(*) filter (where status = 'completed'),
        'no_show', count(*) filter (where status = 'no_show'),
        'cancelled', count(*) filter (where status in ('cancelled', 'refunded')),
        'new_patients', (select count(*) from public.profiles where role = 'patient' and created_at >= v_from and created_at < v_to),
        'avg_rating', (select round(avg(rating)::numeric, 2) from public.doctor_reviews where created_at >= v_from and created_at < v_to))
      from public.appointments where start_at >= v_from and start_at < v_to),
    'bookings_by_week', (
      select jsonb_agg(jsonb_build_object('week', wk.w, 'count', coalesce(x.n, 0)) order by wk.w)
      from unnest(v_weeks) as wk(w)
      left join (select date_trunc('week', created_at at time zone p_tz)::date as w, count(*) as n from public.appointments
                 where created_at >= v_from and created_at < v_to group by 1) x on x.w = wk.w),
    'completed_by_week', (
      select jsonb_agg(jsonb_build_object('week', wk.w, 'count', coalesce(x.n, 0)) order by wk.w)
      from unnest(v_weeks) as wk(w)
      left join (select date_trunc('week', start_at at time zone p_tz)::date as w, count(*) as n from public.appointments
                 where status = 'completed' and start_at >= v_from and start_at < v_to group by 1) x on x.w = wk.w),
    'new_patients_by_week', (
      select jsonb_agg(jsonb_build_object('week', wk.w, 'count', coalesce(x.n, 0)) order by wk.w)
      from unnest(v_weeks) as wk(w)
      left join (select date_trunc('week', created_at at time zone p_tz)::date as w, count(*) as n from public.profiles
                 where role = 'patient' and created_at >= v_from and created_at < v_to group by 1) x on x.w = wk.w),
    'mode_split', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'count', n) order by n desc)
      from (select mode::text as mode, count(*) as n from public.appointments
            where created_at >= v_from and created_at < v_to group by 1) x), '[]'::jsonb),
    'top_doctors', coalesce((
      select jsonb_agg(jsonb_build_object('doctor_id', doctor_id, 'name', name, 'completed', n, 'rating_avg', rating_avg) order by n desc)
      from (select a.doctor_id, trim(coalesce(d.title, '') || ' ' || d.display_name) as name, count(*) as n, d.rating_avg
            from public.appointments a join public.doctor_profiles d on d.user_id = a.doctor_id
            where a.status = 'completed' and a.start_at >= v_from and a.start_at < v_to
            group by a.doctor_id, d.title, d.display_name, d.rating_avg order by n desc limit 10) x), '[]'::jsonb),
    'top_specialties', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'bookings', n) order by n desc)
      from (select s.name, count(*) as n from public.appointments a join public.specialties s on s.id = a.specialty_id
            where a.created_at >= v_from and a.created_at < v_to group by s.name order by n desc limit 10) x), '[]'::jsonb)
  );

  if public.has_permission('finance.manage') then
    v := v || jsonb_build_object(
      'revenue_by_week', coalesce((
        select jsonb_agg(jsonb_build_object('week', wk.w, 'currency', c.currency, 'gross', coalesce(x.gross, 0),
                                            'commission', coalesce(x.commission, 0)) order by wk.w, c.currency)
        from unnest(v_weeks) as wk(w)
        cross join (select distinct e.currency::text as currency from public.financial_ledger_entries e
                    where e.entry_type = 'consultation_earning' and e.created_at >= v_from and e.created_at < v_to) c
        left join (select date_trunc('week', e.created_at at time zone p_tz)::date as w, e.currency::text as currency,
                          sum(e.gross_amount) as gross, sum(e.commission_amount) as commission
                   from public.financial_ledger_entries e
                   where e.entry_type = 'consultation_earning' and e.created_at >= v_from and e.created_at < v_to
                   group by 1, 2) x on x.w = wk.w and x.currency = c.currency), '[]'::jsonb),
      'revenue_totals', coalesce((
        select jsonb_agg(jsonb_build_object('currency', currency, 'gross', gross, 'commission', commission) order by currency)
        from (select currency::text as currency, sum(gross_amount) as gross, sum(commission_amount) as commission
              from public.financial_ledger_entries
              where entry_type = 'consultation_earning' and created_at >= v_from and created_at < v_to
              group by 1) x), '[]'::jsonb));
  end if;
  return v;
end;
$$;

-- Approved invoices in one currency as a bank bulk-transfer list. Pays the account each invoice was raised with
-- (its bank snapshot), never the doctor's current details. Finance only; every export is audited.
create function public.payout_file(p_currency text)
returns table (beneficiary_name text, account_number text, routing_code text, bank_name text, amount numeric,
  currency text, reference text, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.has_permission('finance.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select count(*) into v_count from public.doctor_payouts d
  where d.source = 'invoice' and d.status = 'approved' and d.currency = upper(p_currency);
  perform public.audit('payout.file_export', 'report', 'payout_file',
    jsonb_build_object('currency', upper(p_currency), 'count', v_count));
  return query
  select p.bank_snapshot ->> 'account_holder_name',
         p.bank_snapshot ->> 'account_number',
         coalesce(p.bank_snapshot ->> 'ifsc', p.bank_snapshot ->> 'sort_code', p.bank_snapshot ->> 'routing_number'),
         p.bank_snapshot ->> 'bank_name',
         round(p.amount / 100.0, 2),
         p.currency::text,
         p.invoice_number,
         pr.email
  from public.doctor_payouts p
  join public.profiles pr on pr.id = p.doctor_id
  where p.source = 'invoice' and p.status = 'approved' and p.currency = upper(p_currency)
  order by p.submitted_at;
end;
$$;

revoke execute on function public.admin_analytics(date, date, text), public.payout_file(text) from public, anon;
grant execute on function public.admin_analytics(date, date, text), public.payout_file(text) to authenticated;
