-- kv_store 安全網：①每次覆蓋前自動留一份舊資料 ②內容沒變就不寫 ③筆數突然少一半以上就擋下 ④每次真的寫入版本號 +1
alter table public.kv_store add column if not exists version bigint not null default 1;

create table if not exists public.kv_history (
  id bigserial primary key,
  key text not null,
  value jsonb,
  reason text not null default 'update',
  replaced_at timestamptz not null default now()
);
create index if not exists kv_history_key_idx on public.kv_history (key, id desc);
alter table public.kv_history enable row level security;  -- 不開任何政策：只有 Supabase 後台看得到

create or replace function public.kv_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_n int; new_n int; keep int;
begin
  if tg_op = 'DELETE' then
    insert into kv_history (key, value, reason) values (old.key, old.value, 'delete');
    return old;
  end if;
  if new.value is not distinct from old.value then
    return null;                       -- 內容完全一樣：不寫、不留歷史
  end if;
  if jsonb_typeof(old.value) = 'array' then
    old_n := jsonb_array_length(old.value);
    new_n := case when jsonb_typeof(new.value) = 'array' then jsonb_array_length(new.value) else 0 end;
    if old_n >= 20 and new_n < old_n * 0.5
       and coalesce(current_setting('app.allow_shrink', true), '') <> 'on' then
      raise exception 'kv_guard: % 的筆數從 % 掉到 %，疑似誤覆蓋，已擋下', new.key, old_n, new_n
        using errcode = 'P0001';
    end if;
  end if;
  insert into kv_history (key, value) values (old.key, old.value);
  keep := case when octet_length(old.value::text) > 500000 then 5 else 30 end;
  delete from kv_history h
   where h.key = old.key
     and h.id not in (select id from kv_history where key = old.key order by id desc limit keep);
  new.version := old.version + 1;      -- 版本號只由資料庫決定，前端改不了
  return new;
end $$;

drop trigger if exists kv_guard_trg on public.kv_store;
create trigger kv_guard_trg before update or delete on public.kv_store
  for each row execute function public.kv_guard();
