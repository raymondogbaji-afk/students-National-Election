
create policy "candidate photos public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'candidate-photos');
create policy "candidate photos committee write" on storage.objects for insert to authenticated
  with check (bucket_id = 'candidate-photos' and (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee')));
create policy "candidate photos committee update" on storage.objects for update to authenticated
  using (bucket_id = 'candidate-photos' and (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee')));
create policy "candidate photos committee delete" on storage.objects for delete to authenticated
  using (bucket_id = 'candidate-photos' and (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'committee')));
