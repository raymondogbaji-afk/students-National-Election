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
