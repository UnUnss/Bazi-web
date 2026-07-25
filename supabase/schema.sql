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
