-- Test helpers (loaded by scripts/db/check.ts, and usable against a dev Supabase project
-- via `supabase db execute`). Each test file runs inside a transaction that is rolled back.
-- Fixed seed ids: admin ...0001, Dr Mehta ...0101 (Kolkata), Dr Clarke ...0102 (London),
-- Dr Rivera ...0103 (New York), Emily ...0201 (New York), Oliver ...0202 (London).

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

create or replace function tests.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

create or replace function tests.expect_error(p_sql text, p_pattern text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_pattern || '%' then
      return;
    end if;
    raise exception 'ASSERTION FAILED: expected error "%" but got "%" from: %', p_pattern, sqlerrm, p_sql;
  end;
  raise exception 'ASSERTION FAILED: expected error "%" but it succeeded: %', p_pattern, p_sql;
end;
$$;

-- Act as a signed-in user (role + JWT claims as PostgREST sets them).
create or replace function tests.login(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.login_anon()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function tests.login_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform set_config('role', 'service_role', true);
end;
$$;

-- First instant on/after today + p_skip_days (in p_tz) whose ISO weekday is in p_dows, at local p_time.
create or replace function tests.next_slot(p_tz text, p_dows integer[], p_time time, p_skip_days integer default 2)
returns timestamptz language plpgsql stable as $$
declare
  v_day date := (now() at time zone p_tz)::date + p_skip_days;
begin
  for i in 0..13 loop
    if extract(isodow from v_day + i)::integer = any (p_dows) then
      return ((v_day + i) + p_time) at time zone p_tz;
    end if;
  end loop;
  return null;
end;
$$;

-- Store/read test values across role switches.
create or replace function tests.put(p_key text, p_value text)
returns void language sql as $$ select set_config('tests.' || p_key, p_value, true) $$;
create or replace function tests.get(p_key text)
returns text language sql stable as $$ select current_setting('tests.' || p_key, true) $$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
