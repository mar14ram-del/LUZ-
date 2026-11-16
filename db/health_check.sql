-- 每月健檢（只讀，不會改任何資料）
with tx as (select t from kv_store, jsonb_array_elements(value) t where key='finance:transactions'),
mat as (select m from kv_store, jsonb_array_elements(value) m where key='finance:materials'),
st as (select s from kv_store, jsonb_array_elements(value) s where key='finance:staff')
select '記帳指向已不存在的員工' as item, count(*)::text as n, coalesce(sum((t->>'amount')::numeric),0)::text as amt from tx where coalesce(t->>'staffId','')<>'' and not exists (select 1 from st where s->>'id'=t->>'staffId')
union all select '產品銷售指向已刪除的商品', count(*)::text, coalesce(sum((t->>'amount')::numeric),0)::text from tx where coalesce(t->>'materialId','')<>'' and not exists (select 1 from mat where m->>'id'=t->>'materialId')
union all select '產品銷售沒有記商品', count(*)::text, coalesce(sum((t->>'amount')::numeric),0)::text from tx where t->>'category'='產品銷售' and coalesce(t->>'materialId','')=''
union all select '商品沒有售價', count(*)::text, '' from mat where coalesce((m->>'price')::numeric,0)=0
union all select '商品庫存為 0', count(*)::text, '' from mat where coalesce((m->>'stock')::numeric,0)=0
union all select '商品名稱重複（組）', count(*)::text, '' from (select 1 from mat group by m->>'name' having count(*)>1) x
union all select '近 30 天線上預約申請', count(*)::text, '' from booking_requests where created_at > now() - interval '30 days';
-- 安全網裝好之後另外查：最近被留下的備份
-- select key, reason, replaced_at from kv_history order by id desc limit 20;
