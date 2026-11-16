-- 退回：拿掉安全網（歷史備份表先留著，確定不要再手動 drop table public.kv_history;）
drop trigger if exists kv_guard_trg on public.kv_store;
drop function if exists public.kv_guard();
-- version 欄位留著不影響舊版程式；若新版 storage.js 也已退回，才需要執行下一行
-- alter table public.kv_store drop column if exists version;
