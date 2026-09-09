-- 驿见认证关系型存储。
--
-- 认证接口运行在 Netlify Functions 中，使用服务端 Supabase secret 访问这些表。
-- anon/authenticated 不开放 Data API 权限，RLS 作为额外防线；浏览器不直接访问认证表。

create table if not exists public.yijian_users (
  id uuid primary key,
  email text not null,
  password_hash text,
  email_verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint yijian_users_email_length check (char_length(email) between 3 and 254),
  constraint yijian_users_email_lowercase check (email = lower(email)),
  constraint yijian_users_email_format check (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);

create unique index if not exists yijian_users_email_idx on public.yijian_users (email);

create table if not exists public.yijian_otp_challenges (
  email text not null,
  purpose text not null,
  code_hash text not null,
  sent_at timestamptz not null,
  expires_at timestamptz not null,
  attempts smallint not null default 0,
  window_started_at timestamptz not null,
  sent_count smallint not null default 0,
  used_at timestamptz,
  primary key (email, purpose),
  constraint yijian_otp_purpose_check check (purpose in ('login', 'register')),
  constraint yijian_otp_attempts_check check (attempts between 0 and 5),
  constraint yijian_otp_sent_count_check check (sent_count between 0 and 5),
  constraint yijian_otp_email_lowercase check (email = lower(email))
);

create index if not exists yijian_otp_expiry_idx on public.yijian_otp_challenges (expires_at);

create table if not exists public.yijian_sessions (
  token_hash text primary key,
  user_id uuid not null references public.yijian_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists yijian_sessions_expiry_idx on public.yijian_sessions (expires_at);
create index if not exists yijian_sessions_user_idx on public.yijian_sessions (user_id);

alter table public.yijian_users enable row level security;
alter table public.yijian_otp_challenges enable row level security;
alter table public.yijian_sessions enable row level security;

revoke all on table public.yijian_users, public.yijian_otp_challenges, public.yijian_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.yijian_users, public.yijian_otp_challenges, public.yijian_sessions to service_role;

comment on table public.yijian_users is '驿见邮箱账号；只由服务端认证接口读写。';
comment on table public.yijian_otp_challenges is '驿见邮箱验证码挑战；每个邮箱和用途只保留一个当前挑战。';
comment on table public.yijian_sessions is '驿见服务端会话；只存储不可逆的会话令牌摘要。';

-- 从上一版 yijian_kv 认证存储回填账号，避免已有账号因表结构升级丢失。
-- 用动态 SQL 兼容“远程项目尚未执行上一版迁移”的情况。
do $migration$
begin
  if to_regclass('public.yijian_kv') is null then
    return;
  end if;

  execute $backfill_users$
    insert into public.yijian_users (id, email, password_hash, email_verified_at, created_at, updated_at)
    select
      (value->>'id')::uuid,
      lower(value->>'email'),
      nullif(value->>'passwordHash', ''),
      case
        when value->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (value->>'createdAt')::timestamptz
        else now()
      end,
      case
        when value->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (value->>'createdAt')::timestamptz
        else now()
      end,
      case
        when value->>'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (value->>'updatedAt')::timestamptz
        when value->>'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then (value->>'createdAt')::timestamptz
        else now()
      end
    from public.yijian_kv
    where key like 'user:id:%'
      and value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and lower(value->>'email') ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    on conflict (email) do nothing;
  $backfill_users$;

  -- 迁移仍未过期的旧会话；过期会话不再恢复，用户可重新登录。
  execute $backfill_sessions$
    insert into public.yijian_sessions (token_hash, user_id, expires_at)
    select
      substr(kv.key, 9),
      (kv.value->>'userId')::uuid,
      to_timestamp((kv.value->>'expiresAt')::double precision / 1000.0)
    from public.yijian_kv kv
    join public.yijian_users u on u.id = (kv.value->>'userId')::uuid
    where kv.key like 'session:%'
      and kv.value->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and kv.value->>'expiresAt' ~ '^[0-9]{10,}$'
      and to_timestamp((kv.value->>'expiresAt')::double precision / 1000.0) > now()
    on conflict (token_hash) do nothing;
  $backfill_sessions$;
end
$migration$;
