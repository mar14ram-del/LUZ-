-- 在 Supabase 專案的 SQL Editor 貼上這整份，執行一次即可

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table kv_store enable row level security;

-- 只有登入過的使用者（Authentication 裡建立的帳號）才能讀寫這張表
-- 這樣即使有人知道網址，沒有帳號密碼也看不到任何資料
create policy "authenticated can select" on kv_store
  for select using (auth.role() = 'authenticated');

create policy "authenticated can insert" on kv_store
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated can update" on kv_store
  for update using (auth.role() = 'authenticated');

create policy "authenticated can delete" on kv_store
  for delete using (auth.role() = 'authenticated');
