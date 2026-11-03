-- Prescription templates: private to the owning doctor, with limits on size and count.

select tests.login('00000000-0000-4000-8000-000000000101');
insert into public.prescription_templates (doctor_id, name, items, advice)
values ('00000000-0000-4000-8000-000000000101', 'Viral fever', '[{"medication_name": "Paracetamol"}]', 'Rest and fluids');
select tests.assert((select count(*) from public.prescription_templates) = 1, 'owner sees the template');
-- Name is unique for the doctor, ignoring case.
select tests.expect_error($$insert into public.prescription_templates (doctor_id, name) values ('00000000-0000-4000-8000-000000000101', 'VIRAL FEVER')$$, 'duplicate key');
-- At most 20 medicines, and items must be an array.
select tests.expect_error($$insert into public.prescription_templates (doctor_id, name, items)
  select '00000000-0000-4000-8000-000000000101', 'Too many', jsonb_agg(jsonb_build_object('medication_name', 'M' || g)) from generate_series(1, 21) g$$, 'check constraint');
select tests.expect_error($$insert into public.prescription_templates (doctor_id, name, items) values ('00000000-0000-4000-8000-000000000101', 'Not an array', '{}')$$, 'check constraint');
-- Name is limited to 80 characters and can't be blank.
select tests.expect_error($$insert into public.prescription_templates (doctor_id, name) values ('00000000-0000-4000-8000-000000000101', repeat('x', 81))$$, 'check constraint');
select tests.expect_error($$insert into public.prescription_templates (doctor_id, name) values ('00000000-0000-4000-8000-000000000101', '   ')$$, 'check constraint');
reset role;

-- Another doctor can't see, change, delete or create on the owner's behalf.
select tests.login('00000000-0000-4000-8000-000000000102');
select tests.assert((select count(*) from public.prescription_templates) = 0, 'other doctor sees nothing');
update public.prescription_templates set name = 'Stolen';
delete from public.prescription_templates;
select tests.expect_error($$insert into public.prescription_templates (doctor_id, name) values ('00000000-0000-4000-8000-000000000101', 'Forged')$$, 'row-level security');
reset role;
select tests.assert((select name from public.prescription_templates where doctor_id = '00000000-0000-4000-8000-000000000101') = 'Viral fever', 'other doctor changed and deleted nothing');

-- Admins and patients get nothing; anonymous callers have no privileges at all.
select tests.login('00000000-0000-4000-8000-000000000001');
select tests.assert((select count(*) from public.prescription_templates) = 0, 'admin sees nothing');
reset role;
select tests.login('00000000-0000-4000-8000-000000000201');
select tests.assert((select count(*) from public.prescription_templates) = 0, 'patient sees nothing');
reset role;
select tests.login_anon();
select tests.expect_error($$select * from public.prescription_templates$$, 'permission denied');
reset role;

-- At most 50 templates per doctor.
select tests.login('00000000-0000-4000-8000-000000000101');
insert into public.prescription_templates (doctor_id, name)
select '00000000-0000-4000-8000-000000000101', 'T' || g from generate_series(2, 50) g;
select tests.assert((select count(*) from public.prescription_templates) = 50, 'fifty templates allowed');
select tests.expect_error($$insert into public.prescription_templates (doctor_id, name) values ('00000000-0000-4000-8000-000000000101', 'One too many')$$, 'TEMPLATE_LIMIT');
-- Renaming a template at the limit still works.
update public.prescription_templates set name = 'Renamed' where name = 'T2';
select tests.assert(exists (select 1 from public.prescription_templates where name = 'Renamed'), 'update allowed at the limit');
reset role;

-- Removing a doctor's profile removes their templates.
select tests.login('00000000-0000-4000-8000-000000000103');
insert into public.prescription_templates (doctor_id, name) values ('00000000-0000-4000-8000-000000000103', 'Mine');
reset role;
delete from public.doctor_profiles where user_id = '00000000-0000-4000-8000-000000000103';
select tests.assert(not exists (select 1 from public.prescription_templates where doctor_id = '00000000-0000-4000-8000-000000000103'), 'templates cascade with the doctor');
