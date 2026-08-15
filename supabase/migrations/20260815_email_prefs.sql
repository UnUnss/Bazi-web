-- 注册勾选「订阅每月换运提示」写入此表，供日后发信过滤。
-- 用户可在账号管理中随时改；注销账号时随 auth.users 级联删除。

create table if not exists public.email_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  subscribed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_prefs_subscribed_idx
  on public.email_prefs (subscribed)
  where subscribed = true;

alter table public.email_prefs enable row level security;

drop policy if exists "Users can read own email prefs" on public.email_prefs;
create policy "Users can read own email prefs"
  on public.email_prefs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own email prefs" on public.email_prefs;
create policy "Users can insert own email prefs"
  on public.email_prefs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own email prefs" on public.email_prefs;
create policy "Users can update own email prefs"
  on public.email_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.email_prefs to authenticated;
grant select, insert, update, delete on public.email_prefs to service_role;
