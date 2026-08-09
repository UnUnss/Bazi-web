-- 用户数据直连 Supabase：在 SQL Editor 执行一次

-- 1) 由邮箱回填历史用户归属，无法关联用户的旧测试档案安全删除
update public.bazi_profiles bp
set user_id = au.id
from auth.users au
where bp.user_id is null
  and lower(bp.owner_email) = lower(au.email);

delete from public.bazi_profiles where user_id is null;

alter table public.bazi_profiles
  alter column user_id set not null;

update public.annual_plans ap
set user_id = au.id
from auth.users au
where ap.user_id is null
  and lower(ap.owner_email) = lower(au.email);

update public.download_records dr
set user_id = au.id
from auth.users au
where dr.user_id is null
  and lower(dr.owner_email) = lower(au.email);

alter table public.download_records
  add column if not exists month_ganzhi text;

create index if not exists bazi_profiles_user_id_idx
  on public.bazi_profiles (user_id);
create index if not exists annual_plans_user_id_idx
  on public.annual_plans (user_id);

-- 2) authenticated 用户直接读写自己的档案、读取自己的包年和读写自己的下载记录

-- bazi_profiles：确保写操作 policy 存在（旧版仅走 service_role，可能未建）
drop policy if exists "Users can read own profiles"   on public.bazi_profiles;
create policy "Users can read own profiles"
  on public.bazi_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own profiles" on public.bazi_profiles;
create policy "Users can insert own profiles"
  on public.bazi_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own profiles" on public.bazi_profiles;
create policy "Users can update own profiles"
  on public.bazi_profiles for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own profiles" on public.bazi_profiles;
create policy "Users can delete own profiles"
  on public.bazi_profiles for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own annual plans" on public.annual_plans;
create policy "Users can read own annual plans"
  on public.annual_plans for select
  using (auth.uid() = user_id);

drop policy if exists "Users can read own download records" on public.download_records;
create policy "Users can read own download records"
  on public.download_records for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own download records" on public.download_records;
create policy "Users can insert own download records"
  on public.download_records for insert
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.bazi_profiles to authenticated;
grant select on public.annual_plans to authenticated;
grant select, insert on public.download_records to authenticated;

-- 3) 用户仅能为自己的已付款包年绑定最多两个、且归属自己的八字档案
create or replace function public.set_annual_plan_profiles(
  plan_id text,
  bound_profile_ids uuid[]
)
returns public.annual_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  plan public.annual_plans;
  ids uuid[] := coalesce(bound_profile_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;
  if coalesce(array_length(ids, 1), 0) > 2 then
    raise exception 'At most two profiles may be bound';
  end if;
  if cardinality(ids) <> cardinality(array(select distinct unnest(ids))) then
    raise exception 'Duplicate profile ids are not allowed';
  end if;

  select * into plan
  from public.annual_plans
  where id = plan_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Annual plan not found';
  end if;

  -- 已确认绑定的档案不可解绑；仅允许补齐尚未使用的名额
  if exists (
    select 1
    from jsonb_array_elements_text(plan.profile_ids) as existing_profile(id)
    where not (existing_profile.id::uuid = any(ids))
  ) then
    raise exception 'Bound profiles cannot be removed';
  end if;

  if exists (
    select 1
    from unnest(ids) as bound_profile(id)
    where not exists (
      select 1 from public.bazi_profiles p
      where p.id = bound_profile.id and p.user_id = auth.uid()
    )
  ) then
    raise exception 'A bound profile does not belong to this user';
  end if;

  update public.annual_plans
  set profile_ids = to_jsonb(ids), updated_at = now()
  where id = plan_id and user_id = auth.uid()
  returning * into plan;
  return plan;
end;
$$;

revoke execute on function public.set_annual_plan_profiles(text, uuid[]) from public, anon;
grant execute on function public.set_annual_plan_profiles(text, uuid[]) to authenticated;
