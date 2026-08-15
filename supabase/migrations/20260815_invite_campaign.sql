-- 限时邀请码活动（解耦模块）。下线时可整段删除本文件对应对象，不影响登录/支付/档案。
-- 活动拉新截止：2026-08-31（北京时间）；已发放未使用额度仍可兑换。

create table if not exists public.invite_campaign (
  user_id uuid primary key references auth.users (id) on delete cascade,
  invite_code text not null unique,
  success_count integer not null default 0,
  reward_status text not null default 'none'
    check (reward_status in ('none', 'granted', 'used')),
  device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invitee_id uuid not null references auth.users (id) on delete cascade,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  status text not null check (status in ('counted', 'rejected')),
  reject_reason text,
  device_id text,
  created_at timestamptz not null default now(),
  constraint invite_redemptions_no_self check (invitee_id <> inviter_id)
);

-- 每人只能成功绑定一次邀请码；被拒绝的尝试不占用名额
create unique index if not exists invite_redemptions_one_counted
  on public.invite_redemptions (invitee_id)
  where status = 'counted';

create index if not exists invite_redemptions_inviter_idx
  on public.invite_redemptions (inviter_id);

create index if not exists invite_campaign_code_idx
  on public.invite_campaign (invite_code);

alter table public.invite_campaign enable row level security;
alter table public.invite_redemptions enable row level security;

drop policy if exists "Users can read own invite campaign" on public.invite_campaign;
create policy "Users can read own invite campaign"
  on public.invite_campaign for select
  using (auth.uid() = user_id);

-- 写操作只走 service_role / RPC，不给 authenticated INSERT/UPDATE

grant select on public.invite_campaign to authenticated;
grant select, insert, update, delete on public.invite_campaign to service_role;
grant select, insert, update, delete on public.invite_redemptions to service_role;

-- 原子 +1；满 3 人且尚未发奖时只发一次
create or replace function public.invite_add_success(p_inviter_id uuid)
returns public.invite_campaign
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.invite_campaign;
begin
  update public.invite_campaign
  set
    success_count = success_count + 1,
    reward_status = case
      when success_count + 1 >= 3 and reward_status = 'none' then 'granted'
      else reward_status
    end,
    updated_at = now()
  where user_id = p_inviter_id
  returning * into row;
  return row;
end;
$$;

revoke execute on function public.invite_add_success(uuid) from public, anon, authenticated;
grant execute on function public.invite_add_success(uuid) to service_role;
