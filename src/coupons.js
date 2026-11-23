// =====================================================================
// 優惠券：規則判斷與折抵計算（純函式，不碰畫面、不碰資料庫，方便測試）
//
// 券的種類（存在 kv `promo:coupons`，走 storage.js）：
//   { id, name, active,
//     reward: { kind: "amount" | "percent" | "free", value },
//        amount  = 折 value 元
//        percent = 打 value 折（9 = 九折、85 = 八五折）
//        free    = 送那一項服務（整項折掉）
//     services: [分類名稱]   限用哪些服務；空 = 任何服務（產品銷售永遠不能折）
//     minSpend,              這筆帳（折抵前）要滿多少才能用；0 = 不限
//     startDate, endDate,    活動期間（空 = 不限）
//     validDays,             手動發的券幾天內有效（0 = 跟著 endDate）
//     perCustomer,           每人可用幾次（生日券每年重算）
//     trigger: { kind: "manual" | "birthday" | "firstVisit" | "dormant" | "visits", months, count } }
//
// 發券／使用紀錄存在資料表 coupon_grants（一張一列）：
//   { id, coupon_id, customer_id, issued_at, expires_on, used_at, tx_group_id, source: "manual" | "auto" }
//
// 自動條件不預先發：記帳選了客人、打開顧客頁時，當場用他的消費紀錄判斷。
// 業績：用券後記帳金額就是折後金額，設計師業績照折後算（老闆 2026-11-24 選 A）。
// =====================================================================

export const COUPON_KEY = "promo:coupons";

export const TRIGGERS = [
  { id: "manual", label: "手動發" },
  { id: "birthday", label: "生日當月" },
  { id: "firstVisit", label: "第一次消費後" },
  { id: "dormant", label: "超過 N 個月沒來" },
  { id: "visits", label: "消費滿 N 次" },
];

export const REWARDS = [
  { id: "amount", label: "折抵金額" },
  { id: "percent", label: "打折" },
  { id: "free", label: "送一項服務" },
];

const PRODUCT = "產品銷售";

export function blankCoupon() {
  return {
    id: "cp-" + Math.random().toString(36).slice(2, 10),
    name: "", active: true,
    reward: { kind: "amount", value: 100 },
    services: [], minSpend: 0,
    startDate: "", endDate: "", validDays: 30, perCustomer: 1,
    trigger: { kind: "manual", months: 6, count: 5 },
  };
}

/** 「折 200 元」「九折」「送剪髮加洗髮」 */
export function rewardLabel(c) {
  const r = (c && c.reward) || {};
  const v = Number(r.value) || 0;
  if (r.kind === "percent") {
    const s = String(v).replace(/0$/, "");
    return "打 " + s + " 折";
  }
  if (r.kind === "free") return "送" + ((c.services && c.services[0]) || "一項服務");
  return "折 " + v.toLocaleString() + " 元";
}

export function triggerLabel(c) {
  const t = (c && c.trigger) || {};
  if (t.kind === "dormant") return "超過 " + (Number(t.months) || 0) + " 個月沒來";
  if (t.kind === "visits") return "消費滿 " + (Number(t.count) || 0) + " 次";
  const f = TRIGGERS.find((x) => x.id === t.kind);
  return f ? f.label : "手動發";
}

/** "2026-11-24" + n 天 */
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, d));
  return t.toISOString().slice(0, 10);
}

/** 這位客人「今天之前」來店的日子（同一天多筆算一次），由舊到新 */
export function visitDates(customerId, transactions, beforeDate) {
  const set = new Set();
  (transactions || []).forEach((t) => {
    if (t.customerId === customerId && t.type === "income" && t.date && t.date < beforeDate) set.add(t.date);
  });
  return Array.from(set).sort();
}

/** 手動發的券到期日 */
export function expiryFor(c, issuedDate) {
  const byDays = Number(c.validDays) > 0 ? addDays(issuedDate, Number(c.validDays) - 1) : "";
  if (byDays && c.endDate) return byDays < c.endDate ? byDays : c.endDate;
  return byDays || c.endDate || "";
}

function inPeriod(c, date) {
  if (c.startDate && date < c.startDate) return false;
  if (c.endDate && date > c.endDate) return false;
  return true;
}

/** 這位客人已經用掉這張券幾次（生日券只算今年） */
function usedCount(c, customerId, grants, date) {
  return (grants || []).filter((g) =>
    g.coupon_id === c.id && g.customer_id === customerId && g.used_at &&
    (c.trigger && c.trigger.kind === "birthday" ? String(g.used_at).slice(0, 4) === date.slice(0, 4) : true)
  ).length;
}

/** 自動條件：這位客人在 date 這天符不符合（不看次數） */
export function meetsTrigger(c, customer, transactions, date) {
  const t = (c && c.trigger) || {};
  if (!customer) return false;
  if (t.kind === "birthday") {
    const b = String(customer.birthday || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(b) && b.slice(5, 7) === date.slice(5, 7);
  }
  const visits = visitDates(customer.id, transactions, date);
  if (t.kind === "firstVisit") return visits.length >= 1;
  if (t.kind === "visits") return visits.length >= Math.max(1, Number(t.count) || 0);
  if (t.kind === "dormant") {
    if (visits.length === 0) return false;
    const last = visits[visits.length - 1];
    return addMonths(last, Math.max(1, Number(t.months) || 0)) <= date;
  }
  return false;
}

/**
 * 這位客人在 date 這天可以用的券。
 * 回傳 [{ coupon, grant }]：grant 是手動發給他、還沒用、沒過期的那張；自動條件的 grant = null。
 */
export function availableCoupons({ coupons, grants, customer, transactions, date }) {
  if (!customer) return [];
  const out = [];
  (coupons || []).forEach((c) => {
    if (!c || c.active === false || !inPeriod(c, date)) return;
    const limit = Math.max(1, Number(c.perCustomer) || 1);
    if (usedCount(c, customer.id, grants, date) >= limit) return;
    const mine = (grants || []).find((g) =>
      g.coupon_id === c.id && g.customer_id === customer.id && !g.used_at &&
      (!g.expires_on || g.expires_on >= date)
    );
    if (mine) { out.push({ coupon: c, grant: mine }); return; }
    if (c.trigger && c.trigger.kind !== "manual" && meetsTrigger(c, customer, transactions, date)) {
      out.push({ coupon: c, grant: null });
    }
  });
  return out;
}

/** 某項服務的折抵金額（不超過那一項的金額） */
function discountOn(c, amount) {
  const r = c.reward || {};
  const v = Number(r.value) || 0;
  let d = 0;
  if (r.kind === "amount") d = v;
  else if (r.kind === "percent") {
    const pay = v < 10 ? v * 10 : v;            // 9 → 90%、85 → 85%
    d = Math.round(amount * (100 - Math.min(100, Math.max(0, pay))) / 100);
  } else if (r.kind === "free") d = amount;
  return Math.max(0, Math.min(amount, d));
}

/**
 * 這張券在這筆帳上折哪一項、折多少。
 * rows = 記帳表單的品項 [{ key, category, amount }]
 * 一筆帳只用一張券；只折一項服務（符合限用服務、金額最高的那項）；產品銷售不能折。
 * 回傳 { ok: true, rowKey, discount } 或 { ok: false, reason }
 */
export function planDiscount(c, rows) {
  const items = (rows || [])
    .map((r) => ({ ...r, amt: parseFloat(r.originalAmount != null ? r.originalAmount : r.amount) || 0 }))
    .filter((r) => r.amt > 0);
  const total = items.reduce((s, r) => s + r.amt, 0);
  if (Number(c.minSpend) > 0 && total < Number(c.minSpend)) {
    return { ok: false, reason: "這筆要滿 NT$" + Number(c.minSpend).toLocaleString() + " 才能用" };
  }
  const allow = (c.services || []).filter(Boolean);
  const cand = items.filter((r) => r.category !== PRODUCT && (allow.length === 0 || allow.includes(r.category)));
  if (cand.length === 0) {
    return { ok: false, reason: allow.length ? "這筆沒有「" + allow.join("／") + "」" : "這筆沒有可以折的服務（產品不能用券）" };
  }
  const target = cand.slice().sort((a, b) => b.amt - a.amt)[0];
  const discount = discountOn(c, target.amt);
  if (discount <= 0) return { ok: false, reason: "折抵金額是 0" };
  return { ok: true, rowKey: target.key, discount };
}

/** 把券套到表單品項上：被折的那項記下原價與折抵，金額改成折後 */
export function applyCoupon(rows, c, grantId) {
  const p = planDiscount(c, removeCoupon(rows));
  if (!p.ok) return { rows, error: p.reason };
  const next = removeCoupon(rows).map((r) => {
    if (r.key !== p.rowKey) return r;
    const orig = parseFloat(r.amount) || 0;
    return { ...r, originalAmount: orig, discount: p.discount, amount: String(orig - p.discount), couponId: c.id, couponGrantId: grantId || "" };
  });
  return { rows: next, error: "" };
}

/** 取消用券：金額改回原價 */
export function removeCoupon(rows) {
  return (rows || []).map((r) => {
    if (!r.couponId) return r;
    const { originalAmount, discount, couponId, couponGrantId, ...rest } = r;
    void discount; void couponId; void couponGrantId;
    return { ...rest, amount: String(originalAmount != null ? originalAmount : r.amount) };
  });
}

/** 符合自動條件的客人名單（給優惠券頁的「名單」用），不含已經用完次數的人 */
export function eligibleCustomers({ coupon, customers, grants, transactions, date }) {
  if (!coupon || !coupon.trigger || coupon.trigger.kind === "manual") return [];
  // 先把每位客人的來店日整理好，避免 6,000 位 × 700 筆重複掃
  const byCust = new Map();
  (transactions || []).forEach((t) => {
    if (!t.customerId || t.type !== "income" || !t.date || t.date >= date) return;
    if (!byCust.has(t.customerId)) byCust.set(t.customerId, []);
    byCust.get(t.customerId).push(t);
  });
  const limit = Math.max(1, Number(coupon.perCustomer) || 1);
  return (customers || []).filter((cu) => {
    if (usedCount(coupon, cu.id, grants, date) >= limit) return false;
    return meetsTrigger(coupon, cu, byCust.get(cu.id) || [], date);
  });
}

/** 發券通知的 LINE 訊息 */
export function couponMessage(c, customer, expiresOn, salonName) {
  return [
    (customer && customer.name ? customer.name + " 您好！" : "您好！"),
    (salonName || "LUZ STYLE") + " 送您一張優惠券 🎁",
    "「" + c.name + "」：" + rewardLabel(c) + ((c.services || []).length && c.reward.kind !== "free" ? "（限" + c.services.join("／") + "）" : ""),
    Number(c.minSpend) > 0 ? "消費滿 NT$" + Number(c.minSpend).toLocaleString() + " 可用" : "",
    expiresOn ? "使用期限：" + expiresOn.replace(/-/g, "/") + " 前" : "",
    "到店結帳時告訴設計師就能使用，期待您的光臨！",
  ].filter(Boolean).join("\n");
}
