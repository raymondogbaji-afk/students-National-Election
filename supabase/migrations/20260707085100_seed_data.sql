
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
  ('00000000-0000-0000-0000-000000000001', 'National President',           'national-president',           'national', null, 0, true),
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
