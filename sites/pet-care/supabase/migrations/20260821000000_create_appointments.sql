create extension if not exists pgcrypto;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 100),
  phone text not null check (char_length(trim(phone)) between 6 and 32),
  pet_name text not null check (char_length(trim(pet_name)) between 1 and 80),
  pet_type text not null,
  service text not null,
  appointment_time timestamptz not null,
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now()
);

create index if not exists appointments_appointment_time_idx
  on public.appointments (appointment_time);
create index if not exists appointments_status_idx
  on public.appointments (status);
create index if not exists appointments_created_at_idx
  on public.appointments (created_at);

alter table public.appointments enable row level security;
