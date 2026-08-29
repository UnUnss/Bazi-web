-- 壁纸图池：match=喜用补运匹配（文件夹 1–140）；blindbox=五行盲盒（141–145 水木火土金）
alter table public.wallpapers
  add column if not exists pool text not null default 'match';

alter table public.wallpapers
  drop constraint if exists wallpapers_pool_check;

alter table public.wallpapers
  add constraint wallpapers_pool_check
  check (pool in ('match', 'blindbox'));
