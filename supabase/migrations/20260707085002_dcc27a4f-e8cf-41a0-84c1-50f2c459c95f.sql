
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
