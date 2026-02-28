alter table public.events enable row level security;
alter table public.guests enable row level security;

drop policy if exists events_select_own on public.events;
drop policy if exists events_insert_own on public.events;
drop policy if exists events_update_own on public.events;
drop policy if exists events_delete_own on public.events;

create policy events_select_own
on public.events
for select
using (host_email = auth.email());

create policy events_insert_own
on public.events
for insert
with check (host_email = auth.email());

create policy events_update_own
on public.events
for update
using (host_email = auth.email())
with check (host_email = auth.email());

create policy events_delete_own
on public.events
for delete
using (host_email = auth.email());

drop policy if exists guests_select_for_host_events on public.guests;
drop policy if exists guests_insert_for_host_events on public.guests;
drop policy if exists guests_update_for_host_events on public.guests;
drop policy if exists guests_delete_for_host_events on public.guests;

create policy guests_select_for_host_events
on public.guests
for select
using (
  exists (
    select 1
    from public.events
    where events.id = guests.event_id
      and events.host_email = auth.email()
  )
);

create policy guests_insert_for_host_events
on public.guests
for insert
with check (
  exists (
    select 1
    from public.events
    where events.id = guests.event_id
      and events.host_email = auth.email()
  )
);

create policy guests_update_for_host_events
on public.guests
for update
using (
  exists (
    select 1
    from public.events
    where events.id = guests.event_id
      and events.host_email = auth.email()
  )
)
with check (
  exists (
    select 1
    from public.events
    where events.id = guests.event_id
      and events.host_email = auth.email()
  )
);

create policy guests_delete_for_host_events
on public.guests
for delete
using (
  exists (
    select 1
    from public.events
    where events.id = guests.event_id
      and events.host_email = auth.email()
  )
);
