-- 驿见认证数据存储表。
-- 只允许服务端使用 Supabase secret 访问；anon/authenticated 不开放。
create table if not exists public.yijian_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.yijian_kv enable row level security;

revoke all on table public.yijian_kv from anon, authenticated;
grant select, insert, update, delete on table public.yijian_kv to service_role;

comment on table public.yijian_kv is '驿见服务端认证记录：用户、验证码挑战和会话，不直接暴露给浏览器';