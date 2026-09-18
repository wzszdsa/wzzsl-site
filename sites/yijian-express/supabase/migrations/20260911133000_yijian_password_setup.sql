-- Allow accounts created by the earlier email-OTP flow to add a password later.
-- Existing password_hash values are preserved; NULL means password setup is still available.
alter table public.yijian_users
  add column if not exists password_set_at timestamptz;

update public.yijian_users
set password_set_at = coalesce(password_set_at, updated_at)
where password_hash is not null
  and password_set_at is null;

create index if not exists yijian_users_password_setup_idx
  on public.yijian_users (id)
  where password_hash is null;

comment on column public.yijian_users.password_set_at is '首次设置登录密码的时间；NULL 表示仍可通过已登录会话设置密码。';
