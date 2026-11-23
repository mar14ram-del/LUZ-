-- 優惠券的發券／使用紀錄：一張一列（券的種類本身存在 kv_store 的 promo:coupons）
-- 退回：drop table public.coupon_grants;（會連同紀錄一起刪掉，先確認不要了）
create table if not exists public.coupon_grants (
  id uuid primary key default gen_random_uuid(),
  coupon_id text not null,
  customer_id text not null,
  issued_at timestamptz not null default now(),
  expires_on date,
  used_at timestamptz,
  tx_group_id text,
  source text not null default 'manual' check (source in ('manual', 'auto')),
  notified_at timestamptz,
  note text
);
create index if not exists coupon_grants_customer on public.coupon_grants (customer_id);
create index if not exists coupon_grants_coupon on public.coupon_grants (coupon_id);
create index if not exists coupon_grants_txgroup on public.coupon_grants (tx_group_id);
alter table public.coupon_grants enable row level security;
drop policy if exists "authenticated all" on public.coupon_grants;
create policy "authenticated all" on public.coupon_grants
  for all to authenticated using (true) with check (true);
revoke all on public.coupon_grants from anon;
