-- kv_guard 加強：除了「筆數掉一半」，再擋「一次被拿掉太多筆」。
-- 背景：2026-11-17 有一次存檔刪掉 66 筆、同時加回 29 筆舊帳，筆數只少 9%，舊規則攔不到。
-- 規則：清單 50 筆以上、每筆都有 id 時，一次寫入被拿掉的 id 超過 max(10, 總數的 2%) 就擋下。
-- 正常刪帳一次只會少幾筆。真的要大量刪除：先 set local app.allow_shrink = 'on'（要先問老闆）。
-- 退回：重跑 db/01_kv_guard.sql 即可。
create or replace function public.kv_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_n int; new_n int; keep int; removed int;
begin
  if tg_op = 'DELETE' then
    insert into kv_history (key, value, reason) values (old.key, old.value, 'delete');
    return old;
  end if;
  if new.value is not distinct from old.value then
    return null;
  end if;
  if jsonb_typeof(old.value) = 'array' then
    old_n := jsonb_array_length(old.value);
    new_n := case when jsonb_typeof(new.value) = 'array' then jsonb_array_length(new.value) else 0 end;
    if coalesce(current_setting('app.allow_shrink', true), '') <> 'on' then
      if old_n >= 20 and new_n < old_n * 0.5 then
        raise exception 'kv_guard: % 的筆數從 % 掉到 %，疑似誤覆蓋，已擋下', new.key, old_n, new_n
          using errcode = 'P0001';
      end if;
      if old_n >= 50 and jsonb_typeof(new.value) = 'array' then
        select count(*) into removed from (
          select o->>'id' as i from jsonb_array_elements(old.value) o
           where jsonb_typeof(o) = 'object' and o ? 'id'
          except
          select n->>'id' from jsonb_array_elements(new.value) n
           where jsonb_typeof(n) = 'object' and n ? 'id'
        ) r;
        if removed > greatest(10, old_n * 0.02) then
          raise exception 'kv_guard: % 一次被拿掉 % 筆（共 % 筆），疑似舊畫面蓋掉新資料，已擋下', new.key, removed, old_n
            using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;
  insert into kv_history (key, value) values (old.key, old.value);
  keep := case when octet_length(old.value::text) > 500000 then 5 else 30 end;
  delete from kv_history h
   where h.key = old.key
     and h.id not in (select id from kv_history where key = old.key order by id desc limit keep);
  new.version := old.version + 1;
  return new;
end $$;
