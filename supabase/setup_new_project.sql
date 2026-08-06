-- ============================================================
-- CMDA National Election Portal - FULL SETUP for new project
-- Paste all of this into the new project's SQL editor and run.
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;

-- Enums
create type public.zone as enum ('northern','eastern','western');
create type public.app_role as enum ('super_admin','committee','observer');
create type public.election_status as enum ('draft','open','paused','closed');
create type public.position_kind as enum ('national','zonal');
create type public.code_status as enum ('unused','used','disabled');

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create or replace function public.has_any_admin_role(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id
    and role in ('super_admin','committee','observer'))
$$;

create policy "users read own roles" on public.user_roles for select to authenticated
  using (auth.uid() = user_id);
create policy "super_admin manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'super_admin'));

-- ============ ELECTIONS ============
create table public.elections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_at timestamptz,
  end_at timestamptz,
  status public.election_status not null default 'draft',
  results_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.elections to anon, authenticated;
grant all on public.elections to service_role;
alter table public.elections enable row level security;
create policy "public read elections" on public.elections for select to anon, authenticated using (true);
create policy "committee manage elections" on public.elections for all to authenticated
  using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'))
  with check (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'));

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger trg_elections_updated before update on public.elections
  for each row execute function public.touch_updated_at();

-- ============ POSITIONS ============
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  title text not null,
  slug text not null,
  kind public.position_kind not null,
  zone public.zone,
  order_index int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(election_id, slug),
  check ((kind='national' and zone is null) or (kind='zonal' and zone is not null))
);
grant select on public.positions to anon, authenticated;
grant all on public.positions to service_role;
alter table public.positions enable row level security;
create policy "public read positions" on public.positions for select to anon, authenticated using (true);
create policy "committee manage positions" on public.positions for all to authenticated
  using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'))
  with check (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'));

-- ============ CANDIDATES ============
create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  name text not null,
  institution text,
  profile text,
  photo_url text,
  zone public.zone,
  active boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.candidates to anon, authenticated;
grant all on public.candidates to service_role;
alter table public.candidates enable row level security;
create policy "public read candidates" on public.candidates for select to anon, authenticated using (true);
create policy "committee manage candidates" on public.candidates for all to authenticated
  using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'))
  with check (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'));

create or replace function public.validate_candidate_zone() returns trigger
language plpgsql security definer set search_path=public as $$
declare p_kind public.position_kind; p_zone public.zone;
begin
  select kind, zone into p_kind, p_zone from public.positions where id = new.position_id;
  if p_kind = 'zonal' and new.zone is distinct from p_zone then
    raise exception 'Candidate zone (%) must match position zone (%)', new.zone, p_zone;
  end if;
  return new;
end $$;
create trigger trg_validate_candidate_zone before insert or update on public.candidates
  for each row execute function public.validate_candidate_zone();

-- ============ VOTING CODES ============
create table public.voting_codes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  code text not null unique,
  zone public.zone not null,
  status public.code_status not null default 'unused',
  generated_at timestamptz not null default now(),
  used_at timestamptz,
  device_fingerprint text,
  ip_address text
);
grant select on public.voting_codes to authenticated;
grant all on public.voting_codes to service_role;
alter table public.voting_codes enable row level security;
create policy "admins read codes" on public.voting_codes for select to authenticated
  using (public.has_any_admin_role(auth.uid()));
create policy "committee manage codes" on public.voting_codes for all to authenticated
  using (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'))
  with check (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee'));

create index idx_voting_codes_election_zone on public.voting_codes(election_id, zone, status);

-- ============ VOTES ============
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete restrict,
  candidate_id uuid not null references public.candidates(id) on delete restrict,
  code_id uuid not null references public.voting_codes(id) on delete restrict,
  zone public.zone not null,
  created_at timestamptz not null default now(),
  unique (code_id, position_id)
);
grant select on public.votes to authenticated;
grant all on public.votes to service_role;
alter table public.votes enable row level security;
create policy "admins read votes" on public.votes for select to authenticated
  using (public.has_any_admin_role(auth.uid()));

create index idx_votes_election on public.votes(election_id);
create index idx_votes_position on public.votes(position_id);
create index idx_votes_candidate on public.votes(candidate_id);

-- ============ AUDIT LOGS ============
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_label text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
create policy "admins read audit" on public.audit_logs for select to authenticated
  using (public.has_any_admin_role(auth.uid()));
create policy "admins write audit" on public.audit_logs for insert to authenticated
  with check (public.has_any_admin_role(auth.uid()));

create index idx_audit_created on public.audit_logs(created_at desc);
create index idx_audit_action on public.audit_logs(action);

-- ============ RPCs ============

-- Validate a voting code (public, safe)
create or replace function public.validate_voting_code(p_code text)
returns table(valid boolean, reason text, code_id uuid, election_id uuid, voter_zone public.zone, e_status public.election_status)
language plpgsql security definer set search_path=public as $$
declare v_row public.voting_codes; v_elec public.elections;
begin
  select * into v_row from public.voting_codes where code = p_code;
  if not found then
    return query select false, 'invalid_code'::text, null::uuid, null::uuid, null::public.zone, null::public.election_status;
    return;
  end if;
  if v_row.status = 'used' then
    return query select false, 'code_used'::text, v_row.id, v_row.election_id, v_row.zone, null::public.election_status;
    return;
  end if;
  if v_row.status = 'disabled' then
    return query select false, 'code_disabled'::text, v_row.id, v_row.election_id, v_row.zone, null::public.election_status;
    return;
  end if;
  select * into v_elec from public.elections where id = v_row.election_id;
  if v_elec.status <> 'open' then
    return query select false, 'election_not_open'::text, v_row.id, v_row.election_id, v_row.zone, v_elec.status;
    return;
  end if;
  if v_elec.start_at is not null and now() < v_elec.start_at then
    return query select false, 'election_not_started'::text, v_row.id, v_row.election_id, v_row.zone, v_elec.status;
    return;
  end if;
  if v_elec.end_at is not null and now() > v_elec.end_at then
    return query select false, 'election_ended'::text, v_row.id, v_row.election_id, v_row.zone, v_elec.status;
    return;
  end if;
  return query select true, 'ok'::text, v_row.id, v_row.election_id, v_row.zone, v_elec.status;
end $$;
grant execute on function public.validate_voting_code(text) to anon, authenticated;

-- Cast votes atomically
create or replace function public.cast_votes(
  p_code text,
  p_selections jsonb,
  p_fingerprint text,
  p_ip text
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_code public.voting_codes;
  v_elec public.elections;
  v_sel jsonb;
  v_pos public.positions;
  v_cand public.candidates;
  v_count int := 0;
begin
  select * into v_code from public.voting_codes where code = p_code for update;
  if not found then return jsonb_build_object('ok',false,'reason','invalid_code'); end if;
  if v_code.status <> 'unused' then
    return jsonb_build_object('ok',false,'reason','code_'||v_code.status::text);
  end if;
  select * into v_elec from public.elections where id = v_code.election_id;
  if v_elec.status <> 'open' then
    return jsonb_build_object('ok',false,'reason','election_not_open');
  end if;
  if v_elec.end_at is not null and now() > v_elec.end_at then
    return jsonb_build_object('ok',false,'reason','election_ended');
  end if;

  for v_sel in select * from jsonb_array_elements(p_selections) loop
    select * into v_pos from public.positions
      where id = (v_sel->>'position_id')::uuid and election_id = v_elec.id and active = true;
    if not found then return jsonb_build_object('ok',false,'reason','invalid_position'); end if;
    if v_pos.kind = 'zonal' and v_pos.zone <> v_code.zone then
      return jsonb_build_object('ok',false,'reason','wrong_zone_position');
    end if;
    select * into v_cand from public.candidates
      where id = (v_sel->>'candidate_id')::uuid and position_id = v_pos.id and active = true;
    if not found then return jsonb_build_object('ok',false,'reason','invalid_candidate'); end if;

    insert into public.votes(election_id, position_id, candidate_id, code_id, zone)
      values (v_elec.id, v_pos.id, v_cand.id, v_code.id, v_code.zone);
    v_count := v_count + 1;
  end loop;

  update public.voting_codes
    set status='used', used_at=now(), device_fingerprint=p_fingerprint, ip_address=p_ip
    where id = v_code.id;

  insert into public.audit_logs(action, entity_type, entity_id, metadata, ip_address)
    values ('vote_submission', 'voting_code', v_code.id::text,
            jsonb_build_object('votes_cast', v_count, 'zone', v_code.zone, 'election_id', v_elec.id), p_ip);

  return jsonb_build_object('ok',true,'votes_cast',v_count);
end $$;
grant execute on function public.cast_votes(text, jsonb, text, text) to anon, authenticated;

-- Bulk-generate voting codes (admin only)
create or replace function public.generate_voting_codes(p_election_id uuid, p_zone public.zone, p_count int)
returns int language plpgsql security definer set search_path=public as $$
declare i int; v_code text; inserted int := 0; attempts int;
begin
  if not (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee')) then
    raise exception 'forbidden';
  end if;
  if p_count < 1 or p_count > 10000 then
    raise exception 'count_out_of_range';
  end if;
  for i in 1..p_count loop
    attempts := 0;
    loop
      v_code := upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
      begin
        insert into public.voting_codes(election_id, zone, code) values (p_election_id, p_zone, v_code);
        inserted := inserted + 1;
        exit;
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts > 5 then raise exception 'code_generation_failed'; end if;
      end;
    end loop;
  end loop;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'voting_code_generation', 'election', p_election_id::text,
            jsonb_build_object('count', inserted, 'zone', p_zone));
  return inserted;
end $$;
grant execute on function public.generate_voting_codes(uuid, public.zone, int) to authenticated;

-- Realtime
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.voting_codes;
alter publication supabase_realtime add table public.elections;


-- ============ BOOTSTRAP RPC ============

create or replace function public.bootstrap_super_admin()
returns boolean language plpgsql security definer set search_path=public as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select exists(select 1 from public.user_roles where role='super_admin') into v_exists;
  if v_exists then return false; end if;
  insert into public.user_roles(user_id, role) values (auth.uid(),'super_admin')
    on conflict do nothing;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(),'bootstrap_super_admin','user',auth.uid()::text,'{}'::jsonb);
  return true;
end $$;
grant execute on function public.bootstrap_super_admin() to authenticated;


-- ============ SEED DATA ============

-- Seed data for CMDA Nigeria Students' National Election Portal
-- Run after migrations 1-3 have been applied.

-- ============ ELECTION SEED ============
insert into public.elections (id, name, start_at, end_at, status, results_visible)
values (
  '00000000-0000-0000-0000-000000000001',
  'CMDA Nigeria Students'' National Election 2026',
  now() - interval '1 hour',
  now() + interval '24 hours',
  'draft',
  false
) on conflict (id) do nothing;

-- ============ POSITIONS SEED ============
insert into public.positions (election_id, title, slug, kind, zone, order_index, active)
select * from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'National President',           'national-president',           'national'::public.position_kind, null::public.zone, 0, true),
  ('00000000-0000-0000-0000-000000000001', 'National General Secretary',    'national-general-secretary',   'national', null, 1, true),
  ('00000000-0000-0000-0000-000000000001', 'National Financial Secretary',  'national-financial-secretary', 'national', null, 2, true),
  ('00000000-0000-0000-0000-000000000001', 'National Missions Secretary',   'national-missions-secretary',  'national', null, 3, true),
  ('00000000-0000-0000-0000-000000000001', 'National Academic Secretary',   'national-academic-secretary',  'national', null, 4, true),
  ('00000000-0000-0000-0000-000000000001', 'National Prayer Secretary',     'national-prayer-secretary',    'national', null, 5, true),
  ('00000000-0000-0000-0000-000000000001', 'National Editor-in-Chief',      'national-editor-in-chief',     'national', null, 6, true),
  ('00000000-0000-0000-0000-000000000001', 'Northern Zonal Coordinator',    'northern-zonal-coordinator',   'zonal',    'northern', 0, true),
  ('00000000-0000-0000-0000-000000000001', 'Eastern Zonal Coordinator',     'eastern-zonal-coordinator',    'zonal',    'eastern', 0, true),
  ('00000000-0000-0000-0000-000000000001', 'Western Zonal Coordinator',     'western-zonal-coordinator',    'zonal',    'western', 0, true)
) as v
where not exists (select 1 from public.positions where election_id = '00000000-0000-0000-0000-000000000001' limit 1);

-- ============ CANDIDATES SEED ============
-- Generate sample candidates only if none exist
do $$
declare
  v_positions uuid[];
  v_pos uuid;
begin
  if exists (select 1 from public.candidates where position_id in (select id from public.positions where election_id = '00000000-0000-0000-0000-000000000001') limit 1) then
    return;
  end if;

  -- National positions
  for v_pos in select id from public.positions where election_id = '00000000-0000-0000-0000-000000000001' and kind = 'national' loop
    insert into public.candidates (position_id, name, institution, profile, zone) values
      (v_pos, 'Candidate A - ' || v_pos::text,  'University of Ibadan',          'Committed to serving CMDA Nigeria with integrity and excellence.', null),
      (v_pos, 'Candidate B - ' || v_pos::text,  'Ahmadu Bello University',       'Dedicated medical student passionate about student leadership.',     null),
      (v_pos, 'Candidate C - ' || v_pos::text,  'University of Lagos',           'Advocate for student welfare and academic excellence.',               null);
  end loop;

  -- Zonal positions
  for v_pos in select id from public.positions where election_id = '00000000-0000-0000-0000-000000000001' and kind = 'zonal' and zone = 'northern' loop
    insert into public.candidates (position_id, name, institution, profile, zone) values
      (v_pos, 'Northern Candidate A', 'Bayero University Kano',   'Northern zone representative, committed to unity.', 'northern'),
      (v_pos, 'Northern Candidate B', 'University of Maiduguri',  'Passionate about student development in the North.', 'northern');
  end loop;

  for v_pos in select id from public.positions where election_id = '00000000-0000-0000-0000-000000000001' and kind = 'zonal' and zone = 'eastern' loop
    insert into public.candidates (position_id, name, institution, profile, zone) values
      (v_pos, 'Eastern Candidate A',  'University of Nigeria Nsukka',   'Eastern zone advocate for CMDA growth.',     'eastern'),
      (v_pos, 'Eastern Candidate B',  'Enugu State University',         'Dedicated to serving Eastern zone students.', 'eastern');
  end loop;

  for v_pos in select id from public.positions where election_id = '00000000-0000-0000-0000-000000000001' and kind = 'zonal' and zone = 'western' loop
    insert into public.candidates (position_id, name, institution, profile, zone) values
      (v_pos, 'Western Candidate A',  'University of Ibadan',           'Committed to Western zone development.',     'western'),
      (v_pos, 'Western Candidate B',  'Obafemi Awolowo University',     'Passionate about CMDA student leadership.',   'western');
  end loop;
end $$;

-- ============ VOTING CODES SEED ============
-- Generate test voting codes if none exist
do $$
declare
  v_election_id uuid := '00000000-0000-0000-0000-000000000001';
  v_zones text[] := array['northern', 'eastern', 'western'];
  v_zone text;
  v_count int;
begin
  if exists (select 1 from public.voting_codes where election_id = v_election_id limit 1) then
    return;
  end if;

  foreach v_zone in array v_zones loop
    v_count := 50;
    while v_count > 0 loop
      begin
        insert into public.voting_codes (election_id, code, zone, status) values (
          v_election_id,
          upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10)),
          v_zone::public.zone,
          'unused'
        );
        v_count := v_count - 1;
      exception when unique_violation then
        -- retry
      end;
    end loop;
  end loop;
end $$;

-- ============ AUDIT LOG ============
insert into public.audit_logs (action, entity_type, metadata)
values ('seed_data_applied', 'system', '{"description": "Initial seed data for CMDA Nigeria Students'' National Election 2026"}'::jsonb);


-- ============ FIX GENERATE CODES ============
-- Fix: recreate generate_voting_codes (requires pgcrypto)
create or replace function public.generate_voting_codes(p_election_id uuid, p_zone public.zone, p_count int)
returns int language plpgsql security definer set search_path=public as $$
declare i int; v_code text; inserted int := 0; attempts int;
begin
  if not (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee')) then
    raise exception 'forbidden';
  end if;
  if p_count < 1 or p_count > 10000 then
    raise exception 'count_out_of_range';
  end if;
  for i in 1..p_count loop
    attempts := 0;
    loop
      v_code := upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
      begin
        insert into public.voting_codes(election_id, zone, code) values (p_election_id, p_zone, v_code);
        inserted := inserted + 1;
        exit;
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts > 5 then raise exception 'code_generation_failed'; end if;
      end;
    end loop;
  end loop;
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'voting_code_generation', 'election', p_election_id::text,
            jsonb_build_object('count', inserted, 'zone', p_zone));
  return inserted;
end $$;

grant execute on function public.generate_voting_codes(uuid, public.zone, int) to authenticated;


-- ============ BULK UPLOAD + REMOVE PHOTOS ============
-- ============ BULK ELIGIBLE VOTER UPLOAD ============
-- Track the eligible voter's name alongside the generated code.
alter table public.voting_codes add column if not exists voter_name text;

-- Bulk-create codes for a list of eligible voters uploaded by an admin.
-- p_voters: jsonb array of {"name": "...", "zone": "northern|eastern|western"}
create or replace function public.bulk_create_voting_codes(p_election_id uuid, p_voters jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_row jsonb;
  v_code text;
  created int := 0;
  skipped text[] := '{}';
  attempts int;
begin
  if not (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee')) then
    raise exception 'forbidden';
  end if;

  for v_row in select * from jsonb_array_elements(p_voters) loop
    begin
      attempts := 0;
      loop
        v_code := upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
        begin
          insert into public.voting_codes(election_id, zone, code, voter_name)
          values (p_election_id, (v_row->>'zone')::public.zone, v_code, nullif(v_row->>'name',''));
          created := created + 1;
          exit;
        exception when unique_violation then
          attempts := attempts + 1;
          if attempts > 5 then raise exception 'code_generation_failed'; end if;
        end;
      end loop;
    exception when others then
      skipped := array_append(skipped, v_row->>'name');
    end;
  end loop;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'voting_code_bulk_upload', 'election', p_election_id::text,
            jsonb_build_object('created', created, 'skipped', to_jsonb(skipped)));
  return jsonb_build_object('created', created, 'skipped', skipped);
end $$;
grant execute on function public.bulk_create_voting_codes(uuid, jsonb) to authenticated;

-- ============ REMOVE CANDIDATE PHOTOS ============
alter table public.candidates drop column if exists photo_url;

drop policy if exists "candidate photos public read" on storage.objects;
drop policy if exists "candidate photos committee write" on storage.objects;
drop policy if exists "candidate photos committee update" on storage.objects;
drop policy if exists "candidate photos committee delete" on storage.objects;
do $$
begin
  if exists (select 1 from storage.buckets where id = 'candidate-photos') then
    perform storage.delete_bucket('candidate-photos');
  end if;
end $$;

