-- ============================================================================
-- DEMO DATA: settlement invoices in every state. Run after seed-demo.sql and enrich-demo-profiles.sql:
--
--   npx supabase db query --linked -f supabase/demo/demo-invoices.sql
--
-- Six demo doctors (two per country) get verified "Demo Bank" details with obviously fake numbers, then
-- each raises one invoice through the real submit_invoice() (acting as that demo doctor). Admin steps are
-- applied directly so no real admin appears as the actor of fictional demo actions. Idempotent.
-- ============================================================================

do $$
declare
  v_t0 timestamptz := now();
  v_doc record;
  v_i integer := 0;
  v_appts uuid[];
  v_inv public.doctor_payouts;
  v_target text;
begin
  if exists (select 1 from public.doctor_payouts p join public.profiles d on d.id = p.doctor_id where d.is_demo and p.source = 'invoice') then
    raise notice 'Demo invoices already exist; nothing to do.';
    return;
  end if;

  for v_doc in
    select d.user_id, d.display_name, d.country
    from public.doctor_profiles d
    where d.is_demo
      and (select count(*) from public.appointments a where a.doctor_id = d.user_id and a.status = 'completed') >= 3
    order by d.country, d.registration_number
  loop
    -- Two doctors per country.
    continue when (select count(*) from public.doctor_private_details p join public.doctor_profiles x on x.user_id = p.doctor_id
                   where x.is_demo and x.country = v_doc.country) >= 2;
    v_i := v_i + 1;
    exit when v_i > 6;

    insert into public.doctor_private_details (doctor_id, address_line1, city, postal_code, country, account_holder_name, bank_name,
      bank_country, account_number, ifsc, sort_code, routing_number, account_type, pan, tax_id, kyc_status, submitted_at, verified_at)
    values (v_doc.user_id, 'Demo address ' || v_i, case v_doc.country when 'IN' then 'Mumbai' when 'GB' then 'London' else 'New York' end,
      case v_doc.country when 'IN' then '400001' when 'GB' then 'EC1A 1AA' else '10001' end, v_doc.country,
      v_doc.display_name, 'Demo Bank', v_doc.country,
      case v_doc.country when 'IN' then '00000000000' || v_i when 'GB' then '0000000' || v_i else '000000' || v_i end,
      case when v_doc.country = 'IN' then 'DEMO000000' || v_i end,
      case when v_doc.country = 'GB' then '00000' || v_i end,
      case when v_doc.country = 'US' then '00000000' || v_i end,
      case when v_doc.country = 'US' then 'checking' end,
      case when v_doc.country = 'IN' then 'DEMOP000' || v_i || 'X' end,
      case when v_doc.country = 'US' then '00000000' || v_i end,
      'verified', now() - interval '20 days', now() - interval '19 days');

    -- Up to five most recent completed consultations, submitted as the doctor.
    select array_agg(id) into v_appts from (
      select a.id from public.appointments a
      where a.doctor_id = v_doc.user_id and a.status = 'completed'
        and exists (select 1 from public.financial_ledger_entries l where l.appointment_id = a.id
                    and not exists (select 1 from public.payout_items pi where pi.ledger_entry_id = l.id))
      order by a.start_at desc limit 5) x;
    continue when v_appts is null;
    perform set_config('request.jwt.claim.sub', v_doc.user_id::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_doc.user_id, 'role', 'authenticated')::text, true);
    v_inv := public.submit_invoice(v_appts);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);

    v_target := (array['pending', 'under_review', 'approved', 'paid', 'failed', 'paid'])[v_i];
    update public.doctor_payouts set submitted_at = now() - make_interval(days => 12 - v_i) where id = v_inv.id;
    if v_target in ('under_review', 'approved', 'paid') then
      update public.doctor_payouts set status = 'under_review' where id = v_inv.id;
    end if;
    if v_target in ('approved', 'paid') then
      update public.doctor_payouts set status = 'approved', approved_at = now() - make_interval(days => 10 - v_i) where id = v_inv.id;
    end if;
    if v_target = 'paid' then
      update public.doctor_payouts set status = 'paid', paid_at = now() - make_interval(days => 8 - v_i),
        transaction_reference = 'DEMO-UTR-' || lpad(v_i::text, 6, '0'), payout_method = 'NEFT (demo)'
      where id = v_inv.id;
      insert into public.financial_ledger_entries (doctor_id, entry_type, currency, amount, payout_id, description)
      values (v_doc.user_id, 'payout', v_inv.currency, -v_inv.amount, v_inv.id, 'Payout DEMO-UTR-' || lpad(v_i::text, 6, '0'));
    elsif v_target = 'failed' then
      update public.doctor_payouts set status = 'failed', rejection_reason = 'Demo: bank proof did not match the account name.' where id = v_inv.id;
      delete from public.payout_items where payout_id = v_inv.id;
    end if;
  end loop;

  -- Nothing created by this run may be emailed or shown to real accounts (submit_invoice notifies admins).
  delete from public.notifications where created_at = v_t0;
  delete from public.email_outbox where created_at = v_t0;
end;
$$;
