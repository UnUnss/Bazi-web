-- 免费下载统计：记录用户、次数，以及来源（首次免费 / 邀请码解锁的第二次水印图）
-- 在 Supabase SQL Editor 执行本文件即可。

create table if not exists public.free_download_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  owner_email text not null,
  wallpaper_id uuid,
  r2_key text not null,
  wallpaper_name text,
  -- free   = 新用户第一次免费下载（带 logo 水印）
  -- invite = 邀请满 3 人后的第二次免费下载（同样带 logo 水印，不能兑原图）
  source text not null check (source in ('free', 'invite')),
  created_at timestamptz not null default now()
);

create index if not exists free_download_logs_email_idx
  on public.free_download_logs (owner_email, created_at desc);

create index if not exists free_download_logs_user_idx
  on public.free_download_logs (user_id, created_at desc);

create index if not exists free_download_logs_source_idx
  on public.free_download_logs (source, created_at desc);

-- 同一壁纸 + 同一来源只允许一条记录
create unique index if not exists free_download_logs_user_key_source_idx
  on public.free_download_logs (user_id, r2_key, source)
  where user_id is not null;

-- 每个用户 free/invite 各最多一条，防并发重复插入
create unique index if not exists free_download_logs_user_source_uniq
  on public.free_download_logs (user_id, source)
  where user_id is not null;

alter table public.free_download_logs enable row level security;

grant select, insert, update, delete on public.free_download_logs to service_role;
