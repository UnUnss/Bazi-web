-- 八字档案表
create table if not exists public.bazi_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  gender smallint not null check (gender in (0, 1)),
  birth_date text not null,
  birth_time text not null,
  birthplace text not null,
  birthplace_lon double precision,
  utc_offset double precision,
  use_true_solar_time boolean not null default false,
  use_dst boolean not null default false,  -- 夏令时
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 若表已建好、只差夏令时字段，执行下面这行即可：
-- alter table public.bazi_profiles
--   add column if not exists use_dst boolean not null default false;

alter table public.bazi_profiles enable row level security;

create policy "Users can read own profiles"
  on public.bazi_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own profiles"
  on public.bazi_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profiles"
  on public.bazi_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own profiles"
  on public.bazi_profiles for delete
  using (auth.uid() = user_id);

-- ════════════════════════════════════════════
-- 管理员表 profiles（若已建可跳过 create）
-- ════════════════════════════════════════════
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text;

alter table public.profiles enable row level security;

-- 模拟登录用：按邮箱判断是否管理员（不暴露整张表）
create or replace function public.is_admin_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where lower(email) = lower(check_email)
      and is_admin = true
  );
$$;

grant execute on function public.is_admin_email(text) to anon, authenticated;

-- 把你的管理员邮箱写进已有管理员行（把邮箱改成你的再执行）：
-- update public.profiles
-- set email = '你的管理员邮箱@qq.com', is_admin = true
-- where is_admin = true;
--
-- 若还没有任何管理员行：先在 Authentication → Users 找到用户 UUID，再执行：
-- insert into public.profiles (id, email, is_admin)
-- values ('这里填用户UUID', '你的管理员邮箱@qq.com', true);

-- 壁纸预览图路径（页面展示用；原图仍在 r2_key）
alter table public.wallpapers
  add column if not exists preview_key text;
