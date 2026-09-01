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


-- =====================================================================
-- 待確認預約 = 卡住時段（2026-09 新增）
--
-- 客人在預約頁送出 → booking_requests 產生一筆 status='pending'。
-- 在你按「確認」或「退回」之前，那個設計師 / 那個時段就不讓別人選，
-- 也不讓別人送出。按「退回」後時段自動釋放。
--
-- 下面這段可以獨立貼到 SQL Editor 執行一次。重覆執行也沒關係。
-- =====================================================================

-- 1) 給客人預約頁讀的「已卡住時段」清單。
--    只給 設計師 / 日期 / 起訖，不含姓名、電話、備註等個資。
create or replace view public_hold_slots as
select
  staff_id,
  req_date,
  start_min,
  duration_min
from booking_requests
where status = 'pending'
  and staff_id is not null
  and req_date >= current_date;

grant select on public_hold_slots to anon, authenticated;

-- 2) 送出當下的硬性關卡：同一位設計師、同一天，已有 pending 申請
--    的時段跟這次重疊，就直接擋下，客人送不出去。
create or replace function block_overlapping_booking_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.staff_id is not null then
    if exists (
      select 1
      from booking_requests b
      where b.staff_id = new.staff_id
        and b.req_date = new.req_date
        and b.status = 'pending'
        and b.start_min < new.start_min + new.duration_min
        and new.start_min < b.start_min + b.duration_min
    ) then
      raise exception 'slot_already_taken'
        using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_block_overlapping_booking_request on booking_requests;

create trigger trg_block_overlapping_booking_request
  before insert on booking_requests
  for each row
  execute function block_overlapping_booking_request();
