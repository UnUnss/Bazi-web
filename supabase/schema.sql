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
  country_code text,  -- ISO2，编辑弹窗回填国家下拉
  state_code text,    -- 省/州 isoCode
  city_name text,     -- 城市显示名
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- 若表已建好、只差夏令时字段，执行下面这行即可：
-- alter table public.bazi_profiles
--   add column if not exists use_dst boolean not null default false;

-- 若表已建好、只差地点下拉回填字段，执行下面三行即可：
-- alter table public.bazi_profiles
--   add column if not exists country_code text,
--   add column if not exists state_code text,
--   add column if not exists city_name text;

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

-- 模拟登录：八字档案按邮箱归属（user_id 可空）
alter table public.bazi_profiles
  add column if not exists owner_email text;

alter table public.bazi_profiles
  alter column user_id drop not null;

create index if not exists bazi_profiles_owner_email_idx
  on public.bazi_profiles (owner_email);

-- 壁纸跨月去重历史：{ "丙午|乙未": ["wallpaper-uuid", ...], ... }，只保留当前流年
alter table public.bazi_profiles
  add column if not exists wallpaper_history jsonb not null default '{}'::jsonb;

grant select, insert, update, delete on public.bazi_profiles to service_role;

-- ════════════════════════════════════════════
-- 包年方案（绑定档案 ID、有效期）按账号云端保存
-- ════════════════════════════════════════════
create table if not exists public.annual_plans (
  id text primary key,
  owner_email text not null,
  user_id uuid references auth.users (id) on delete set null,
  start_date date not null,
  end_date date not null,
  profile_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists annual_plans_owner_email_idx
  on public.annual_plans (owner_email);

alter table public.annual_plans enable row level security;

-- 业务读写走 service_role API；RLS 仅作兜底
create policy "Users can read own annual plans"
  on public.annual_plans for select
  using (
    auth.uid() = user_id
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

grant select, insert, update, delete on public.annual_plans to service_role;

-- ════════════════════════════════════════════
-- 下载记录（对应前端 ew_download_history）
-- ════════════════════════════════════════════
create table if not exists public.download_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  owner_email text not null,
  wallpaper_id uuid,                 -- 对应 wallpapers.id（可空，兼容旧本地记录）
  r2_key text not null,              -- 原图 R2 key
  preview_url text,                  -- 预览图 URL（展示用）
  wallpaper_name text,               -- 展示名（如五行名）
  profile_id uuid,                   -- 可选：当时使用的八字档案
  order_id uuid,                     -- 可选：关联支付订单
  created_at timestamptz not null default now()
);

create index if not exists download_records_owner_email_idx
  on public.download_records (owner_email, created_at desc);

create index if not exists download_records_user_id_idx
  on public.download_records (user_id, created_at desc);

create index if not exists download_records_r2_key_idx
  on public.download_records (r2_key);

alter table public.download_records enable row level security;

create policy "Users can read own download records"
  on public.download_records for select
  using (
    auth.uid() = user_id
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

grant select, insert, update, delete on public.download_records to service_role;

-- ════════════════════════════════════════════
-- 支付订单
-- product_type:
--   single  = 单张 US$5.99
--   pack2   = 2 张 US$10.99
--   pack4   = 4 张 US$19.99
--   mixed   = 任意张数，按 4+2+1 组合计价（如 3=pack2+single）
--   annual  = 包年 US$219.99
-- status: pending | paid | failed | refunded | cancelled
-- ════════════════════════════════════════════
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  owner_email text not null,
  product_type text not null
    check (product_type in ('single', 'pack2', 'pack4', 'mixed', 'annual')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  amount_cents integer not null check (amount_cents >= 0),  -- 以分为单位，避免浮点
  currency text not null default 'USD',
  -- 支付渠道（接入后填）：stripe / paypal / alipay / wechat / mock ...
  provider text,
  provider_payment_id text,          -- 渠道侧支付单号
  provider_session_id text,          -- 渠道侧 session / checkout id
  -- 包年关联的方案 id（product_type=annual 时用）
  annual_plan_id text references public.annual_plans (id) on delete set null,
  paid_at timestamptz,
  meta jsonb not null default '{}'::jsonb,  -- 扩展字段（渠道原始回执等）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_orders_owner_email_idx
  on public.payment_orders (owner_email, created_at desc);

create index if not exists payment_orders_user_id_idx
  on public.payment_orders (user_id, created_at desc);

create index if not exists payment_orders_status_idx
  on public.payment_orders (status);

create unique index if not exists payment_orders_provider_payment_uidx
  on public.payment_orders (provider, provider_payment_id)
  where provider is not null and provider_payment_id is not null;

alter table public.payment_orders enable row level security;

create policy "Users can read own payment orders"
  on public.payment_orders for select
  using (
    auth.uid() = user_id
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

grant select, insert, update, delete on public.payment_orders to service_role;

-- 订单明细（单张 / 打包购入的壁纸；包年订单可无明细行）
create table if not exists public.payment_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.payment_orders (id) on delete cascade,
  wallpaper_id uuid,
  r2_key text not null,
  preview_url text,
  wallpaper_name text,
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists payment_order_items_order_id_idx
  on public.payment_order_items (order_id);

alter table public.payment_order_items enable row level security;

create policy "Users can read own payment order items"
  on public.payment_order_items for select
  using (
    exists (
      select 1 from public.payment_orders o
      where o.id = order_id
        and (
          auth.uid() = o.user_id
          or lower(o.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

grant select, insert, update, delete on public.payment_order_items to service_role;

-- download_records.order_id → payment_orders（表建好后再加外键，避免顺序问题）
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'download_records_order_id_fkey'
  ) then
    alter table public.download_records
      add constraint download_records_order_id_fkey
      foreign key (order_id) references public.payment_orders (id) on delete set null;
  end if;
end $$;

-- 已有库：允许 mixed（任意张数组合计价）
do $$
begin
  alter table public.payment_orders drop constraint if exists payment_orders_product_type_check;
  alter table public.payment_orders
    add constraint payment_orders_product_type_check
    check (product_type in ('single', 'pack2', 'pack4', 'mixed', 'annual'));
exception
  when others then null;
end $$;

