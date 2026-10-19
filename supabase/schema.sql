-- =====================================================================
-- קצין בטיחות v2 — Supabase schema
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- helper: updated_at trigger ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- vehicles ----------
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null unique,
  vehicle_type text not null default 'minibus'
    check (vehicle_type in ('minibus','van','bus','private','other')),
  manufacturer text,
  model text,
  year int,
  seats int,
  current_km int,
  next_service_km int,
  default_driver_id uuid,
  notes text,
  active boolean not null default true,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- added in v2.1 (safe on existing projects)
alter table public.vehicles add column if not exists next_service_km int;

-- ---------- drivers ----------
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  id_number text,
  phone text,
  default_vehicle_id uuid references public.vehicles(id) on delete set null,
  notes text,
  active boolean not null default true,
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.vehicles
    add constraint vehicles_default_driver_fk
    foreign key (default_driver_id) references public.drivers(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------- expiry items (vehicle + bus + driver dates) ----------
create table if not exists public.expiry_items (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('vehicle','driver')),
  owner_id uuid not null,
  item_key text not null,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id, item_key)
);
create index if not exists expiry_items_date_idx on public.expiry_items (expiry_date);

-- ---------- driver flags ----------
create table if not exists public.driver_flags (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  regulation_84 boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- services (maintenance) ----------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_date date not null,
  km int,
  service_type text not null default 'periodic',
  garage text,
  cost numeric(10,2),
  description text,
  next_date date,
  next_km int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists services_vehicle_idx on public.services (vehicle_id, service_date desc);

-- ---------- documents ----------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('vehicle','driver','service')),
  owner_id uuid not null,
  slot_key text not null,
  is_current boolean not null default true,
  replaced_at timestamptz,
  expiry_at_upload date,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists documents_owner_idx on public.documents (owner_type, owner_id, slot_key);
-- only one current document per slot
create unique index if not exists documents_one_current
  on public.documents (owner_type, owner_id, slot_key) where is_current;

create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  storage_path text not null,
  page_no int not null default 1,
  mime text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_pages_doc_idx on public.document_pages (document_id, page_no);

-- ---------- tachograph log ----------
create table if not exists public.tachograph_days (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  day date not null,
  checked boolean not null default false,
  driver_id uuid references public.drivers(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, day)
);

create table if not exists public.tachograph_signoffs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 12),
  signature_path text,
  signed_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, year, month)
);

-- ---------- settings (single row) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  ntfy_topic text,
  lead_days int[] not null default '{30,14,7,1,0}',
  service_days int not null default 14,
  service_km int not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- notification log ----------
create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'digest' check (kind in ('digest','test')),
  sent_on date not null default current_date,
  status text not null default 'sent' check (status in ('sent','error','skipped')),
  title text,
  body text,
  item_count int not null default 0,
  priority text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- never send the same daily digest twice
create unique index if not exists notification_log_one_digest_per_day
  on public.notification_log (sent_on) where kind = 'digest' and status = 'sent';

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['vehicles','drivers','expiry_items','driver_flags','services',
    'documents','document_pages','tachograph_days','tachograph_signoffs','settings','notification_log']
  loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------- cleanup of polymorphic rows when an owner is hard-deleted ----------
create or replace function public.cleanup_owner_rows() returns trigger
language plpgsql as $$
declare kind text := tg_argv[0];
begin
  delete from public.expiry_items where owner_type = kind and owner_id = old.id;
  -- documents rows are removed; storage files are removed by the app before delete
  delete from public.documents where owner_type = kind and owner_id = old.id;
  return old;
end $$;

drop trigger if exists trg_vehicles_cleanup on public.vehicles;
create trigger trg_vehicles_cleanup after delete on public.vehicles
  for each row execute function public.cleanup_owner_rows('vehicle');
drop trigger if exists trg_drivers_cleanup on public.drivers;
create trigger trg_drivers_cleanup after delete on public.drivers
  for each row execute function public.cleanup_owner_rows('driver');
drop trigger if exists trg_services_cleanup on public.services;
create trigger trg_services_cleanup after delete on public.services
  for each row execute function public.cleanup_owner_rows('service');

-- ---------- Row Level Security: only the logged-in user ----------
do $$
declare t text;
begin
  foreach t in array array['vehicles','drivers','expiry_items','driver_flags','services',
    'documents','document_pages','tachograph_days','tachograph_signoffs','settings','notification_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated_all" on public.%I', t);
    execute format('create policy "authenticated_all" on public.%I for all
                    using (auth.role() = ''authenticated'')
                    with check (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

-- ---------- Storage: private bucket "documents" ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents_authenticated_select" on storage.objects;
drop policy if exists "documents_authenticated_insert" on storage.objects;
drop policy if exists "documents_authenticated_update" on storage.objects;
drop policy if exists "documents_authenticated_delete" on storage.objects;

create policy "documents_authenticated_select" on storage.objects for select
  using (bucket_id = 'documents' and auth.role() = 'authenticated');
create policy "documents_authenticated_insert" on storage.objects for insert
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');
create policy "documents_authenticated_update" on storage.objects for update
  using (bucket_id = 'documents' and auth.role() = 'authenticated')
  with check (bucket_id = 'documents' and auth.role() = 'authenticated');
create policy "documents_authenticated_delete" on storage.objects for delete
  using (bucket_id = 'documents' and auth.role() = 'authenticated');
