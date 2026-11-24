import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { availableCoupons, rewardLabel, expiryFor } from "./coupons.js";

// =====================================================================
// my-bookings：客人在預約頁的「我的預約」
// （原始碼副本在 repo 的 supabase/functions/my-bookings；coupons.js 是 src/coupons.js 的複本，改規則要兩邊一起改）
//
//   { action: "list",    accessToken }      → 這位客人「即將到來」的預約
//   { action: "cancel",  accessToken, id }  → 客人自行取消一筆
//   { action: "profile", accessToken }      → 這個 LINE 上次預約留的姓名、手機（來過的客人免重填）
//   { action: "coupons", accessToken }      → 這個 LINE 連到的顧客現在可以用的優惠券
//
// 身分驗證：前端送來 LIFF 的 access token，這裡向 LINE 確認
//   1) token 是我們這個 LINE Login channel 發的、還沒過期
//   2) 用 token 換到 LINE userId
// 之後只查 line_user_id = 這個人 的資料，所以別人查不到別人的預約。
// （因為自己驗身分，所以部署時 verify_jwt 關閉。）
//
// 已確認的預約會去 kv_store 的 appointments:list 找正式預約，
// 顯示你在班表上改過後的時間。
// 已確認的預約被取消時，只把申請標成 cancelled、cancel_synced=false，
// 由後台網頁下次開啟時把班表上那筆改成「已取消」（避免兩邊同時寫班表互相覆蓋）。
// =====================================================================

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// LIFF ID 是「channelId-亂碼」，前半段就是 LINE Login channel ID
const CHANNEL_ID = Deno.env.get("LINE_LOGIN_CHANNEL_ID") || "2011350495";
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

async function lineUserFromAccessToken(token: string): Promise<string | null> {
  const v = await fetch("https://api.line.me/oauth2/v2.1/verify?access_token=" + encodeURIComponent(token));
  if (!v.ok) return null;
  const info = await v.json();
  if (String(info.client_id) !== CHANNEL_ID || !(Number(info.expires_in) > 0)) return null;
  const p = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: "Bearer " + token } });
  if (!p.ok) return null;
  const prof = await p.json();
  return prof.userId || null;
}

function taipeiToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
}
function taipeiNowMin(): number {
  const s = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Taipei", hour12: false });
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}
function hhmm(min: number) {
  const m = Math.max(0, Math.round(min));
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}
function niceDate(s: string) {
  const [y, mo, d] = s.split("-").map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return mo + "/" + d + "（" + WEEK[wd] + "）";
}

// deno-lint-ignore no-explicit-any
type Row = any;

async function loadContext(db: ReturnType<typeof createClient>, needAppts: boolean) {
  const [cfg, appts, staff] = await Promise.all([
    db.from("public_config").select("payload").eq("id", 1).maybeSingle(),
    needAppts ? db.from("kv_store").select("value").eq("key", "appointments:list").maybeSingle() : Promise.resolve({ data: null }),
    needAppts ? db.from("kv_store").select("value").eq("key", "finance:staff").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const stores: Row[] = (cfg.data && cfg.data.payload && cfg.data.payload.stores) || [];
  const apptList: Row[] = (appts.data && Array.isArray(appts.data.value)) ? appts.data.value : [];
  const staffList: Row[] = (staff.data && Array.isArray(staff.data.value)) ? staff.data.value : [];
  return { stores, apptList, staffList };
}

// 把一筆申請整理成客人看得到的樣子（已確認的用正式預約的最新資料）
function shape(r: Row, ctx: { stores: Row[]; apptList: Row[]; staffList: Row[] }) {
  let date = r.req_date as string;
  let startMin = r.start_min as number;
  let durationMin = r.duration_min as number;
  let storeId = r.store_id as string | null;
  let staffName = r.staff_name as string | null;
  let status = r.status === "approved" ? "confirmed" : r.status;

  if (r.status === "approved" && r.appointment_id) {
    const a = ctx.apptList.find((x: Row) => x.id === r.appointment_id);
    if (a) {
      date = a.date || date;
      startMin = Number(a.startMin);
      durationMin = Number(a.durationMin) || durationMin;
      storeId = a.storeId || storeId;
      const st = ctx.staffList.find((s: Row) => s.id === a.staffId);
      if (st) staffName = st.name;
      if (a.status === "cancelled" || a.status === "noshow") status = "cancelled_by_salon";
    }
  }
  // 不指定、還沒確認：先不告訴客人系統暫排的是誰
  if (r.status === "pending" && r.staff_requested === false) staffName = null;

  const store = ctx.stores.find((s: Row) => s.id === storeId);
  return {
    id: r.id,
    date, startMin, durationMin,
    storeId,
    storeName: store ? store.name : (r.store_name || ""),
    staffName,
    staffRequested: r.staff_requested !== false,
    services: r.service_names || "",
    price: Number(r.est_price) || 0,
    status,
  };
}

function isUpcoming(b: { date: string; startMin: number; durationMin: number }, today: string, nowMin: number) {
  if (b.date > today) return true;
  if (b.date < today) return false;
  return b.startMin + b.durationMin > nowMin;
}
function notStarted(b: { date: string; startMin: number }, today: string, nowMin: number) {
  return b.date > today || (b.date === today && b.startMin > nowMin);
}

const COLS = "id, req_date, start_min, duration_min, store_id, store_name, staff_name, staff_requested, service_names, est_price, status, appointment_id";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { action?: string; accessToken?: string; id?: string };
  try { body = await req.json(); } catch { return json({ error: "請求格式錯誤" }, 400); }

  if (!body.accessToken) return json({ error: "需要先用 LINE 登入" }, 401);
  let uid: string | null = null;
  try { uid = await lineUserFromAccessToken(body.accessToken); } catch { uid = null; }
  if (!uid) return json({ error: "LINE 登入已過期，請重新登入" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = taipeiToday();
  const nowMin = taipeiNowMin();
  const yesterday = new Date(Date.parse(today + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);

  if (body.action === "coupons") {
    // 資料庫函式只回這個 LINE 連到的那位顧客自己的資料
    const { data, error } = await db.rpc("my_coupon_context", { p_line: uid });
    if (error) return json({ error: "讀取失敗：" + error.message }, 500);
    const ctx = data || {};
    if (!ctx.customer) return json({ ok: true, linked: false, coupons: [] });
    const avail = availableCoupons({
      coupons: ctx.coupons || [], grants: ctx.grants || [], customer: ctx.customer,
      transactions: ctx.transactions || [], date: today,
    });
    const coupons = avail.map(({ coupon, grant }: Row) => {
      const limits = [];
      if ((coupon.services || []).length && coupon.reward.kind !== "free") limits.push("限" + coupon.services.join("／"));
      if (Number(coupon.minSpend) > 0) limits.push("消費滿 NT$" + Number(coupon.minSpend).toLocaleString() + " 可用");
      const exp = grant ? (grant.expires_on || "") : (coupon.trigger && coupon.trigger.kind === "birthday"
        ? today.slice(0, 8) + String(new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate()).padStart(2, "0")
        : (coupon.endDate || ""));
      return { name: coupon.name, reward: rewardLabel(coupon), limit: limits.join("・"), expiresOn: exp };
    });
    void expiryFor;
    return json({ ok: true, linked: true, coupons });
  }

  if (body.action === "profile") {
    // 這個 LINE 最近一次預約留的姓名、手機（只查自己的）
    const { data, error } = await db.from("booking_requests").select("customer_name, phone")
      .eq("line_user_id", uid)
      .not("phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return json({ error: "讀取失敗：" + error.message }, 500);
    const r = data && data[0];
    return json({ ok: true, profile: r ? { name: r.customer_name, phone: r.phone } : null });
  }

  if (body.action === "list") {
    // 已確認的可能被你在班表往前改過日期，所以多抓一天再用正式預約的時間過濾
    const { data, error } = await db.from("booking_requests").select(COLS)
      .eq("line_user_id", uid)
      .in("status", ["pending", "approved", "rejected"])
      .gte("req_date", yesterday)
      .order("req_date").order("start_min");
    if (error) return json({ error: "讀取失敗：" + error.message }, 500);
    const rows = data || [];
    const ctx = await loadContext(db, rows.some((r: Row) => r.status === "approved"));
    const list = rows.map((r: Row) => shape(r, ctx))
      .filter((b) => isUpcoming(b, today, nowMin))
      .map((b) => ({ ...b, canCancel: (b.status === "pending" || b.status === "confirmed") && notStarted(b, today, nowMin) }))
      .sort((a, b) => (a.date + hhmm(a.startMin)).localeCompare(b.date + hhmm(b.startMin)));
    return json({ ok: true, bookings: list });
  }

  if (body.action === "cancel") {
    if (!body.id) return json({ error: "缺少預約編號" }, 400);
    const { data: row, error } = await db.from("booking_requests").select(COLS + ", line_user_id")
      .eq("id", body.id).eq("line_user_id", uid).maybeSingle();
    if (error) return json({ error: "讀取失敗：" + error.message }, 500);
    if (!row) return json({ error: "找不到這筆預約" }, 404);
    if (row.status !== "pending" && row.status !== "approved") return json({ error: "這筆預約已經無法取消" }, 409);

    const ctx = await loadContext(db, row.status === "approved");
    const b = shape(row, ctx);
    if (b.status === "cancelled_by_salon") return json({ error: "這筆預約已經取消了" }, 409);
    if (!notStarted(b, today, nowMin)) return json({ error: "預約時間已經開始，無法線上取消，請直接聯絡我們" }, 409);

    const { data: upd, error: uerr } = await db.from("booking_requests")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        // 待確認的沒有正式預約，不用後台同步班表
        cancel_synced: row.status === "pending",
      })
      .eq("id", row.id).eq("status", row.status)
      .select("id");
    if (uerr) return json({ error: "取消失敗：" + uerr.message }, 500);
    if (!upd || upd.length === 0) return json({ error: "預約狀態剛剛有變動，請重新整理再試一次" }, 409);

    // 傳一則取消確認給客人（失敗不影響取消本身）
    const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
    if (token) {
      const text = "已為您取消 " + niceDate(b.date) + " " + hhmm(b.startMin) + (b.storeName ? " 在" + b.storeName : "") + " 的預約。\n期待下次為您服務！";
      try {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ to: uid, messages: [{ type: "text", text }] }),
        });
      } catch { /* 推播失敗就算了 */ }
    }
    return json({ ok: true });
  }

  return json({ error: "不支援的動作" }, 400);
});
