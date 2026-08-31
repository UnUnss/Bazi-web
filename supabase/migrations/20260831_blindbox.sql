-- 五行盲盒：每账号每流月开启记录 + 集齐兑换 + 下载来源

alter table public.download_records
  add column if not exists source text not null default 'purchase';

alter table public.download_records
  drop constraint if exists download_records_source_check;

alter table public.download_records
  add constraint download_records_source_check
  check (source in ('purchase', 'annual', 'redeem'));

create table if not exists public.blindbox_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month_ganzhi text not null,
  draw_count integer not null default 0
    check (draw_count >= 0 and draw_count <= 3),
  current_ids uuid[] not null default '{}',
  opened_ids uuid[] not null default '{}',
  credit2_used boolean not null default false,
  credit3_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month_ganzhi)
);

create index if not exists blindbox_months_user_idx
  on public.blindbox_months (user_id);

alter table public.blindbox_months enable row level security;

create policy "Users can read own blindbox months"
  on public.blindbox_months for select
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.blindbox_months to service_role;
grant select on public.blindbox_months to authenticated;

create table if not exists public.blindbox_redeems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  r2_key text not null,
  wallpaper_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists blindbox_redeems_user_idx
  on public.blindbox_redeems (user_id, created_at desc);

alter table public.blindbox_redeems enable row level security;

create policy "Users can read own blindbox redeems"
  on public.blindbox_redeems for select
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.blindbox_redeems to service_role;
grant select on public.blindbox_redeems to authenticated;

do $$
begin
  alter table public.payment_orders drop constraint if exists payment_orders_product_type_check;
  alter table public.payment_orders
    add constraint payment_orders_product_type_check
    check (product_type in (
      'single', 'pack2', 'pack4', 'mixed', 'annual',
      'blindbox', 'blindbox_draw'
    ));
exception
  when others then null;
end $$;
