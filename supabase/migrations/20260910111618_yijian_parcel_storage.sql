-- YiJian logistics records.
-- Only Netlify Functions use the Supabase server secret; the browser cannot access these tables.

create table if not exists public.yijian_parcels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.yijian_users(id) on delete cascade,
  tracking_no text not null,
  carrier_code text,
  carrier_name text,
  status text not null default '运输中',
  status_detail text,
  location text,
  pickup_code text,
  pickup_location text,
  eta text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yijian_parcels_tracking_no_length check (char_length(tracking_no) between 4 and 128),
  constraint yijian_parcels_unique_tracking unique nulls not distinct (user_id, tracking_no, carrier_code)
);

create table if not exists public.yijian_parcel_events (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.yijian_parcels(id) on delete cascade,
  event_at timestamptz,
  title text not null,
  description text not null,
  location text,
  created_at timestamptz not null default now(),
  constraint yijian_parcel_events_unique unique nulls not distinct (parcel_id, event_at, title, description)
);

create index if not exists yijian_parcels_user_synced_idx on public.yijian_parcels (user_id, last_synced_at desc);
create index if not exists yijian_parcel_events_parcel_time_idx on public.yijian_parcel_events (parcel_id, event_at desc);

alter table public.yijian_parcels enable row level security;
alter table public.yijian_parcel_events enable row level security;

revoke all on table public.yijian_parcels, public.yijian_parcel_events from public, anon, authenticated;
grant select, insert, update, delete on table public.yijian_parcels, public.yijian_parcel_events to service_role;

comment on table public.yijian_parcels is '驿见服务端同步的用户快递记录；由当前登录用户手动提交运单号查询。';
comment on table public.yijian_parcel_events is '驿见服务端同步的物流轨迹；不包含收寄件人信息。';
