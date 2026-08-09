-- 包年绑定：忽略 profile_ids 里非法 uuid（如历史残留 demo-1），避免勾选/保存异常
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
  -- 忽略非法 uuid（如历史残留的 demo-1），下次保存时会被清掉
  if exists (
    select 1
    from jsonb_array_elements_text(plan.profile_ids) as existing_profile(id)
    where existing_profile.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not (existing_profile.id::uuid = any(ids))
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

-- 一次性清掉已有包年里的非法 profile id
update public.annual_plans
set profile_ids = coalesce((
  select jsonb_agg(to_jsonb(x))
  from jsonb_array_elements_text(profile_ids) as t(x)
  where t.x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
), '[]'::jsonb),
updated_at = now()
where exists (
  select 1
  from jsonb_array_elements_text(profile_ids) as t(x)
  where t.x !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
