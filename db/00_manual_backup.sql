-- 步驟 0：動任何東西之前先留一份完整備份（約 5 MB）
create table if not exists public.kv_backup_20261113 as select * from public.kv_store;
alter table public.kv_backup_20261113 enable row level security;
-- 確認：select key, octet_length(value::text) from kv_backup_20261113 order by key;   （應有 13 列）
-- 不需要時：drop table public.kv_backup_20261113;
