-- 把 64 筆指向「舊魚皮編號」的帳改指到現在的魚皮。執行前請老闆確認舊編號確實是魚皮。
-- 需先裝好 01_kv_guard.sql（這樣改之前會自動留備份）。
update public.kv_store
set value = (
  select jsonb_agg(case when t->>'staffId' = '9a46996e-3c93-4abd-867d-977b2a27a4fd'
                        then jsonb_set(t, '{staffId}', '"ce4a2881-ea28-43c5-b3d8-b7ed7df63d75"') else t end order by o)
  from jsonb_array_elements(value) with ordinality a(t, o)),
  updated_at = now()
where key = 'finance:transactions';
-- 確認：再跑 db/health_check.sql，第一列應從 64 變 0，總筆數不變。
-- 退回：update kv_store set value = (select value from kv_history where key='finance:transactions' order by id desc limit 1) where key='finance:transactions';
