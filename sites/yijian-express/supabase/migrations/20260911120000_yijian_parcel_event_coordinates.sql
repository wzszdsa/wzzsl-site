-- Store optional coordinates returned by a carrier map-tracking API.
-- NULL is intentional: standard polling APIs often return only text locations.
alter table public.yijian_parcel_events
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6);

alter table public.yijian_parcel_events
  drop constraint if exists yijian_parcel_events_latitude_check,
  drop constraint if exists yijian_parcel_events_longitude_check;

alter table public.yijian_parcel_events
  add constraint yijian_parcel_events_latitude_check check (latitude is null or latitude between -90 and 90),
  add constraint yijian_parcel_events_longitude_check check (longitude is null or longitude between -180 and 180);

create index if not exists yijian_parcel_events_geo_idx
  on public.yijian_parcel_events (parcel_id, event_at desc)
  where latitude is not null and longitude is not null;
