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
