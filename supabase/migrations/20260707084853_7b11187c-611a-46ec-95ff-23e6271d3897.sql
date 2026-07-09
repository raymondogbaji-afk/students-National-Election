
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
