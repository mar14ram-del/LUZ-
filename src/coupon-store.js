// 優惠券的發券／使用紀錄（資料表 coupon_grants）與 LINE 通知
// 券的種類本身存在 kv `promo:coupons`，用 storage.js 的 loadKey / saveKey 讀寫。
import { supabase } from "./supabaseClient";

/** 讀發券紀錄；給 customerId 就只讀那位客人的 */
export async function loadGrants(customerId) {
  let q = supabase.from("coupon_grants").select("*").order("issued_at", { ascending: false });
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return data || [];
}

/** 手動發券（可一次發給多位），回傳新增的紀錄 */
export async function issueGrants(couponId, customerIds, expiresOn, note) {
  const rows = customerIds.map((cid) => ({
    coupon_id: couponId, customer_id: cid, expires_on: expiresOn || null, source: "manual", note: note || null,
  }));
  const { data, error } = await supabase.from("coupon_grants").insert(rows).select("*");
  if (error) throw error;
  return data || [];
}

/** 記帳用掉一張券：手動發的那張標成已用；自動條件的就新增一列已用的紀錄 */
export async function markUsed({ couponId, grantId, customerId, txGroupId }) {
  const now = new Date().toISOString();
  if (grantId) {
    const { error } = await supabase.from("coupon_grants")
      .update({ used_at: now, tx_group_id: txGroupId }).eq("id", grantId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("coupon_grants").insert({
    coupon_id: couponId, customer_id: customerId, used_at: now, tx_group_id: txGroupId, source: "auto",
  });
  if (error) throw error;
}

/** 整筆帳刪掉：手動發的券還給客人（改回未使用），自動條件的使用紀錄刪掉 */
export async function releaseForGroup(txGroupId) {
  const a = await supabase.from("coupon_grants").update({ used_at: null, tx_group_id: null })
    .eq("tx_group_id", txGroupId).eq("source", "manual");
  if (a.error) throw a.error;
  const b = await supabase.from("coupon_grants").delete().eq("tx_group_id", txGroupId).eq("source", "auto");
  if (b.error) throw b.error;
}

/** 傳 LINE 給一位客人；回傳 { ok, error } */
export async function sendLine(lineUserId, message) {
  try {
    const { data, error } = await supabase.functions.invoke("notify-line", { body: { lineUserId, message } });
    if (error) return { ok: false, error: error.message || "傳送失敗" };
    if (data && data.error) return { ok: false, error: data.error + (data.status === 400 || data.status === 403 ? "（客人可能沒加好友或已封鎖）" : "") };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || "傳送失敗" };
  }
}

export async function markNotified(grantIds) {
  if (!grantIds.length) return;
  await supabase.from("coupon_grants").update({ notified_at: new Date().toISOString() }).in("id", grantIds);
}
