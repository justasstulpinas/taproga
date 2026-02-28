insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-photos',
  'event-photos',
  false,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists event_photos_host_select on storage.objects;
drop policy if exists event_photos_host_insert on storage.objects;
drop policy if exists event_photos_host_update on storage.objects;
drop policy if exists event_photos_host_delete on storage.objects;

create policy event_photos_host_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'event-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$'
  and split_part(name, '/', 3) = ''
  and exists (
    select 1
    from public.events e
    where e.id::text = split_part(name, '/', 1)
      and e.host_id = auth.uid()
  )
);

create policy event_photos_host_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$'
  and split_part(name, '/', 3) = ''
  and exists (
    select 1
    from public.events e
    where e.id::text = split_part(name, '/', 1)
      and e.host_id = auth.uid()
  )
);

create policy event_photos_host_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$'
  and split_part(name, '/', 3) = ''
  and exists (
    select 1
    from public.events e
    where e.id::text = split_part(name, '/', 1)
      and e.host_id = auth.uid()
  )
)
with check (
  bucket_id = 'event-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$'
  and split_part(name, '/', 3) = ''
  and exists (
    select 1
    from public.events e
    where e.id::text = split_part(name, '/', 1)
      and e.host_id = auth.uid()
  )
);

create policy event_photos_host_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-photos'
  and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$'
  and split_part(name, '/', 3) = ''
  and exists (
    select 1
    from public.events e
    where e.id::text = split_part(name, '/', 1)
      and e.host_id = auth.uid()
  )
);
