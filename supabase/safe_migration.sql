-- ============================================================
-- CMDA National Election Portal - SAFE RE-RUN MIGRATION
-- Handles already-existing types and tables
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;

-- Enums (safe re-run)
do $$ begin
  create type public.zone as enum ('northern','eastern','western');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.app_role as enum ('super_admin','committee','observer');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.election_status as enum ('draft','open','paused','closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.position_kind as enum ('national','zonal');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.code_status as enum ('unused','used','disabled');
exception when duplicate_object then null;
end $$;

-- ============ VOTING CODES: add voter_name column ============
alter table public.voting_codes add column if not exists voter_name text;

-- ============ FUNCTIONS ============
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create or replace function public.has_any_admin_role(_user_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id
    and role in ('super_admin','committee','observer'))
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

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

create or replace function public.bulk_create_candidates(p_election_id uuid, p_candidates jsonb)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_row jsonb;
  v_pos public.positions;
  v_name text;
  v_pos_title text;
  created int := 0;
  skipped jsonb := '[]'::jsonb;
begin
  if not (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee')) then
    raise exception 'forbidden';
  end if;

  for v_row in select * from jsonb_array_elements(p_candidates) loop
    begin
      v_name := nullif(v_row->>'name','');
      v_pos_title := nullif(v_row->>'position','');
      if v_name is null or v_pos_title is null then
        skipped := skipped || jsonb_build_object('name', coalesce(v_name, v_row->>'name'), 'reason', 'Missing name or position');
        continue;
      end if;

      select * into v_pos from public.positions
        where election_id = p_election_id and trim(lower(title)) = trim(lower(v_pos_title))
        limit 1;
      if not found then
        skipped := skipped || jsonb_build_object('name', v_name, 'reason', 'Position not found: ' || v_pos_title);
        continue;
      end if;

      insert into public.candidates(position_id, name, institution, profile, zone)
      values (v_pos.id, v_name, nullif(v_row->>'institution',''), nullif(v_row->>'profile',''),
              case when v_pos.kind = 'zonal' then v_pos.zone else null end);
      created := created + 1;
    exception when others then
      skipped := skipped || jsonb_build_object('name', v_row->>'name', 'reason', SQLERRM);
    end;
  end loop;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'candidate_bulk_upload', 'election', p_election_id::text,
            jsonb_build_object('created', created, 'skipped', skipped));
  return jsonb_build_object('created', created, 'skipped', skipped);
end $$;
grant execute on function public.bulk_create_candidates(uuid, jsonb) to authenticated;

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
