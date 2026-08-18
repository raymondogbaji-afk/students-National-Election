-- Add current_position column to candidates table
alter table public.candidates add column if not exists current_position text;

-- Update bulk_create_candidates to accept current_position
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

      insert into public.candidates(position_id, name, institution, current_position, profile, zone)
      values (v_pos.id, v_name, nullif(v_row->>'institution',''), nullif(v_row->>'current_position',''), nullif(v_row->>'profile',''),
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
