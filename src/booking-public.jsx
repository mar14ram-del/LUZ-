// =====================================================================
// booking-public.jsx — 公開預約頁（多店版）
//
// 兩條入口走到同一個地方：
//   選分店 → 那天在這家店的設計師 → 時間
//   選設計師 → 他哪幾天在哪家店 → 時間
//
// 不需登入。只讀 public_config 和 public_availability 兩張表，
// 送出時只往 booking_requests 寫入一筆。讀不到任何顧客資料。
// =====================================================================

import React, { useState, useEffect, useMemo } from "react";
import liff from "@line/liff";
import { supabase } from "./supabaseClient";
import { BRAND } from "./stores";
import {
  Check, ChevronLeft, ChevronRight, Clock, MapPin, Store, Users,
  AlertCircle, Loader2, PartyPopper, Scissors, SquareParking, Pointer,
} from "lucide-react";

// LIFF 登入用來讓客人接收預約確認的 LINE 推播。
// 這組 ID 是「登入」用的頻道，跟站方發訊息用的 Channel Access Token 是分開的東西。
// LIFF ID 本來就會被打包進前端、任何人都看得到，不是機密，所以直接寫死當預設值，
// 省去每次都要在 GitHub 設密鑰；真要換帳號時再用環境變數覆蓋即可。
const LIFF_ID = import.meta.env.VITE_LIFF_ID || "2011350495-Nsh4G20W";
// 客人點「用 LINE 登入」時，LINE 會整頁導去登入再導回來，
// 這段期間先把目前填到一半的預約狀態存起來，導回來後才能接著填，不用重選一次。
const LIFF_PENDING_KEY = "luz_liff_pending_booking_v1";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@600;700&family=Noto+Sans+TC:wght@400;500;600&display=swap');`;

const SERIF = "'Noto Serif TC', serif";
const SANS = "'Noto Sans TC', system-ui, sans-serif";

/* =====================================================================
   藍染色系 —— 靈感來自藍染布：淺藍圓形、深靛十字花，落在米白底上。
   舊的色名（BRASS / SAGE / WINE…）刻意保留，只換掉色值，
   這樣檔案裡其他還在引用它們的地方不必改動就會跟著換色。
   ===================================================================== */
const INDIGO = "#2E5EA6";        // 主色：頁首、主要按鈕、選中狀態
const INDIGO_DEEP = "#27508F";   // 主色 hover
const INDIGO_MOTIF = "#16346B";  // 頁首裝飾圖紋
const SKY = "#6FA8C7";           // 淺藍：卡片下緣彩色陰影、已完成的進度

const INK = "#1C2A3E";
const PAPER = "#EFEDE7";
const PAPER_LINE = "#DFDBD0";
const PAPER_RAISED = "#F8F7F3";
const BRASS = INDIGO;            // 強調色（沿用舊名）
const BRASS_LIGHT = "#E9F0F8";   // 選中底色
const WINE = "#B4342B";
const WINE_LIGHT = "#F7E4E1";
const SAGE = "#2F6C8E";      // 深一階的藍：當文字或圖示用，落在淺色底上才夠對比
const SAGE_LIGHT = "#DCEAF0";
const MUTED = "#7C8AA0";

/* 各分店的識別色 —— 用在卡片下緣那條彩色陰影與可點的文字上。
   新增分店時在這裡補一個 id 就好，沒設定的會用預設的淺藍。 */
const STORE_ACCENT = { luz: "#1B4C9E", ali: "#C51AA6" };
function accentOf(storeId) { return STORE_ACCENT[storeId] || SKY; }

/** 卡片下緣的彩色陰影 */
function liftOf(color) {
  return "0 3px 0 0 " + color + ", 0 12px 22px -16px rgba(20,40,80,0.55)";
}

/* Google 地圖：一個連到分店本身，一個連到分店附近的停車場 */
function storeMapUrl(s) {
  return "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(s.name + " 髮型屋 " + s.address);
}
function parkingMapUrl(s) {
  return "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent("停車場 " + s.address);
}

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const FOUND_US_OPTIONS = ["朋友介紹", "Google 地圖", "Instagram", "Facebook", "路過看到", "其他"];

/* ---------- 工具 ---------- */

function toHHMM(min) {
  const m = Math.max(0, Math.round(min));
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}
function fmtDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseDate(s) {
  const p = String(s || "").split("-").map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}
function todayStr() { return fmtDate(new Date()); }
function weekdayOf(s) { return WEEKDAY_ZH[parseDate(s).getDay()]; }
function fmtMoney(n) { return "NT$" + (Math.round(Number(n) || 0)).toLocaleString("zh-TW"); }
/** 客人看到的價格一律加「起」——實際金額依髮長髮況而定 */
function fmtFrom(n) { return fmtMoney(n) + " 起"; }
const PRICE_NOTE = "此為預估價格。實際金額會因髮長、髮量與髮況調整，最終價格請現場與設計師確認。";
function niceDate(s) {
  const d = parseDate(s);
  return (d.getMonth() + 1) + " 月 " + d.getDate() + " 日（" + weekdayOf(s) + "）";
}
/** 把區間格式化：一樣就顯示單一值，不一樣顯示 a–b */
function fmtRange(min, max, fmt) {
  const f = fmt || ((n) => String(n));
  return min === max ? f(min) : f(min) + "–" + f(max);
}

function isValidPhone(p) {
  const digits = String(p || "").replace(/[^0-9]/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function tiersOf(sv) { return (sv && sv.tiers) || []; }
function addonsOf(sv) { return (sv && sv.addons) || []; }
function hasTiers(sv) { return tiersOf(sv).length > 1; }
function tierById(sv, tierId) {
  const ts = tiersOf(sv);
  return ts.find((t) => t.id === tierId) || ts[0] || null;
}
function defaultTierId(sv) {
  const ts = tiersOf(sv);
  if (!ts.length) return "";
  return ts.slice().sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))[0].id;
}

/** 某位設計師某個分級的實際價格與時間（設計師的加價套用到所有分級） */
function effectiveTier(designer, sv, tierId) {
  const t = tierById(sv, tierId);
  if (!t) return { price: 0, durationMin: 0, label: "", from: false };
  const a = ((designer && designer.rates) || {})[sv.id] || {};
  return {
    price: Math.max(0, (Number(t.price) || 0) + (Number(a.priceAdj) || 0)),
    durationMin: Math.max(0, (Number(t.durationMin) || 0) + (Number(a.durationAdj) || 0)),
    label: t.label || "",
    from: !!t.from,
  };
}

/** 一組已選項目（服務+分級+加價）對某位設計師的總計 */
function totalFor(designer, picks, services) {
  return (picks || []).reduce(
    (acc, p) => {
      const sv = (services || []).find((s) => s.id === p.serviceId);
      if (!sv) return acc;
      const e = effectiveTier(designer, sv, p.tierId);
      let price = e.price, dur = e.durationMin;
      (p.addonIds || []).forEach((aid) => {
        const ad = addonsOf(sv).find((x) => x.id === aid);
        if (ad) { price += Number(ad.price) || 0; dur += Number(ad.durationMin) || 0; }
      });
      return { price: acc.price + price, durationMin: acc.durationMin + dur, from: acc.from || e.from };
    },
    { price: 0, durationMin: 0, from: false }
  );
}

/** 從 slot 級別的空檔，算出這個時長塞得進去的起始時間 */
function usableStarts(slots, durationMin, slotMin, closeMin) {
  if (!slots || slots.length === 0) return [];
  const set = new Set(slots);
  const needed = Math.ceil(durationMin / slotMin);
  const out = [];
  slots.slice().sort((a, b) => a - b).forEach((start) => {
    if (start + durationMin > closeMin) return;
    let ok = true;
    for (let i = 0; i < needed; i++) {
      if (!set.has(start + i * slotMin)) { ok = false; break; }
    }
    if (ok) out.push(start);
  });
  return out;
}

/* ---------- 小元件 ---------- */

function StepDots({ step, total }) {
  return (
    <div className="dots">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={"dot" + (i < step ? " dot-done" : i === step ? " dot-now" : "")} />
      ))}
    </div>
  );
}

/** 藍染十字花圖紋 —— 頁首裝飾與品牌標記共用同一個形狀 */
function Motif({ className, round }) {
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {round ? <circle cx="50" cy="50" r="46" /> : (
        <>
          <circle cx="50" cy="27" r="27" /><circle cx="50" cy="73" r="27" />
          <circle cx="27" cy="50" r="27" /><circle cx="73" cy="50" r="27" />
          <circle cx="50" cy="50" r="20" />
        </>
      )}
    </svg>
  );
}

function Avatar({ photo, name, size = 54 }) {
  if (photo) {
    return <img className="avatar-img" src={photo} alt={name}
      style={{ width: size, height: size }} loading="lazy" />;
  }
  return (
    <span className="avatar-ph" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {(name || "?").slice(0, 1)}
    </span>
  );
}

/* ---------- 主元件 ---------- */

export default function PublicBookingPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [config, setConfig] = useState(null);
  const [availability, setAvailability] = useState({});

  const [entry, setEntry] = useState("");          // "" | "store" | "staff"
  const [step, setStep] = useState(0);
  const [storeId, setStoreId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [picks, setPicks] = useState([]);
  const [monthAnchor, setMonthAnchor] = useState(todayStr());
  const [date, setDate] = useState("");
  const [startMin, setStartMin] = useState(null);

  const [form, setForm] = useState({
    customerName: "", phone: "", lineId: "", isNewCustomer: true,
    wantedService: "", allergies: "", foundUsFrom: FOUND_US_OPTIONS[0], note: "",
    lineUserId: "", lineDisplayName: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const [liffReady, setLiffReady] = useState(false);
  const [liffBusy, setLiffBusy] = useState(false);
  const [liffError, setLiffError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [cfgRes, avRes] = await Promise.all([
          supabase.from("public_config").select("payload").eq("id", 1).maybeSingle(),
          supabase.from("public_availability").select("day, payload").gte("day", todayStr()).order("day"),
        ]);
        if (cfgRes.error) throw cfgRes.error;
        if (avRes.error) throw avRes.error;
        const p = cfgRes.data && cfgRes.data.payload;
        if (!p || !p.services || !p.stores) {
          setLoadError("線上預約還沒開放，請直接來電或用 LINE 聯絡我們。");
          setLoading(false);
          return;
        }
        const map = {};
        (avRes.data || []).forEach((r) => { map[r.day] = r.payload || {}; });
        setConfig(p);
        setAvailability(map);
      } catch (e) {
        setLoadError("載入時段時發生問題，請重新整理頁面，或直接來電預約。");
      }
      setLoading(false);
    })();
  }, []);

  // 初始化 LIFF；如果客人是「登入後被導回來」的，把先前存起來的填寫進度復原。
  useEffect(() => {
    if (!LIFF_ID) return; // 沒設定 LIFF_ID 就整段跳過，不影響原本不用 LINE 也能預約的流程
    (async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        setLiffReady(true);
        if (liff.isLoggedIn()) {
          try {
            const raw = sessionStorage.getItem(LIFF_PENDING_KEY);
            if (raw) {
              const saved = JSON.parse(raw);
              if (saved.entry) setEntry(saved.entry);
              if (typeof saved.step === "number") setStep(saved.step);
              if (saved.storeId) setStoreId(saved.storeId);
              if (saved.staffId) setStaffId(saved.staffId);
              if (saved.picks) setPicks(saved.picks);
              if (saved.date) setDate(saved.date);
              if (typeof saved.startMin === "number") setStartMin(saved.startMin);
              if (saved.form) setForm((f) => ({ ...f, ...saved.form }));
              sessionStorage.removeItem(LIFF_PENDING_KEY);
            }
          } catch { /* 復原失敗就算了，客人重填一次也不影響送出 */ }
          const profile = await liff.getProfile();
          setForm((f) => ({ ...f, lineUserId: profile.userId, lineDisplayName: profile.displayName || "" }));
        }
      } catch (e) {
        // LIFF 初始化失敗（例如不支援的瀏覽器）就靜默放棄，「用 LINE 登入」按鈕不會顯示，
        // 客人仍可用原本的手機/LINE ID 欄位完成預約。
      }
    })();
  }, []);

  /** 把目前填到一半的預約狀態存起來，準備讓客人去 LINE 登入再導回來 */
  function saveStateBeforeLiffRedirect() {
    try {
      sessionStorage.setItem(LIFF_PENDING_KEY, JSON.stringify({ entry, step, storeId, staffId, picks, date, startMin, form }));
    } catch { /* 存不起來就算了，最多是導回來要重填 */ }
  }

  async function handleLineLogin() {
    setLiffError("");
    setLiffBusy(true);
    try {
      if (!liff.isLoggedIn()) {
        saveStateBeforeLiffRedirect();
        liff.login({ redirectUri: window.location.href });
        return; // 頁面即將整頁導離，不會執行到下面
      }
      const profile = await liff.getProfile();
      setForm((f) => ({ ...f, lineUserId: profile.userId, lineDisplayName: profile.displayName || "" }));
    } catch (e) {
      setLiffError("LINE 登入時發生問題，請稍後再試，或直接留下手機號碼讓我們與您聯繫。");
    } finally {
      setLiffBusy(false);
    }
  }

  const stores = (config && config.stores) || [];
  const designers = (config && config.designers) || [];
  const services = (config && config.services) || [];
  const slotMin = (config && config.slotMin) || 15;
  const salonName = (config && config.salonName) || BRAND;

  const storeById = useMemo(() => {
    const m = {};
    stores.forEach((s) => { m[s.id] = s; });
    return m;
  }, [stores]);
  const staffById = useMemo(() => {
    const m = {};
    designers.forEach((s) => { m[s.id] = s; });
    return m;
  }, [designers]);

  // 這些設計師是這次可能為客人服務的人（用來算價格區間）
  const candidateStaff = useMemo(() => {
    if (staffId) return designers.filter((d) => d.id === staffId);
    if (!storeId) return designers;
    const ids = new Set();
    Object.keys(availability).forEach((day) => {
      const per = availability[day] || {};
      Object.keys(per).forEach((k) => { if (per[k] && per[k].store === storeId) ids.add(k); });
    });
    return designers.filter((d) => ids.has(d.id));
  }, [designers, staffId, storeId, availability]);

  /** 某位設計師做完這些服務要多久、多少錢 */
  const totalOf = (sid) => totalFor(staffById[sid], picks, services);

  // 價格與時間區間（客人還沒確定誰服務時顯示）
  const range = useMemo(() => {
    const pool = candidateStaff.length ? candidateStaff : [null];
    const totals = pool.map((d) => totalFor(d, picks, services));
    const prices = totals.map((t) => t.price);
    const durs = totals.map((t) => t.durationMin);
    return {
      minPrice: Math.min(...prices), maxPrice: Math.max(...prices),
      minDur: Math.min(...durs), maxDur: Math.max(...durs),
    };
  }, [candidateStaff, picks, services]);

  // 已確定設計師時用他的數字，否則用區間下限當代表
  const duration = staffId ? totalOf(staffId).durationMin : range.minDur;
  const estPrice = staffId ? totalOf(staffId).price : range.minPrice;

  /* ----- 某天某位設計師在哪家店 / 有哪些空檔 ----- */

  function entryFor(day, sid) {
    const d = availability[day];
    return d ? d[sid] : null;
  }

  /** 這位設計師未來哪幾天在哪家店（給「選設計師」入口用） */
  const staffStoreDays = useMemo(() => {
    if (!staffId) return {};
    const out = {};
    Object.keys(availability).forEach((day) => {
      const e = entryFor(day, staffId);
      if (e && e.store) out[day] = e.store;
    });
    return out;
  }, [availability, staffId]);

  /** 這位設計師會出現在哪些店（用於介紹卡的說明文字） */
  const storesOfStaff = useMemo(() => {
    const out = {};
    designers.forEach((d) => {
      const set = new Set();
      Object.keys(availability).forEach((day) => {
        const e = entryFor(day, d.id);
        if (e && e.store) set.add(e.store);
      });
      out[d.id] = Array.from(set);
    });
    return out;
  }, [availability, designers]);

  /** 某天某家店有哪些設計師（用於「選分店」入口） */
  function staffAtStoreOn(day, sid) {
    const d = availability[day] || {};
    return Object.keys(d).filter((k) => d[k] && d[k].store === sid);
  }

  /** 哪些日子有位子 */
  const dayHasRoom = useMemo(() => {
    const out = {};
    if (!duration) return out;
    Object.keys(availability).forEach((day) => {
      const perStaff = availability[day] || {};
      const ids = staffId
        ? [staffId]
        : Object.keys(perStaff).filter((k) => perStaff[k] && perStaff[k].store === storeId);
      out[day] = ids.some((id) => {
        const e = perStaff[id];
        if (!e) return false;
        if (storeId && e.store !== storeId) return false;
        const st = storeById[e.store];
        const closeMin = st ? st.closeMin : 1260;
        const dur = totalFor(staffById[id], picks, services).durationMin;
        if (!dur) return false;
        return usableStarts(e.slots, dur, slotMin, closeMin).length > 0;
      });
    });
    return out;
  }, [availability, picks, services, staffId, storeId, slotMin, storeById, staffById]);

  /** 選定日期後可約的時間點 */
  const slotsForDate = useMemo(() => {
    if (!date || !duration) return [];
    const perStaff = availability[date] || {};
    const ids = staffId
      ? [staffId]
      : Object.keys(perStaff).filter((k) => perStaff[k] && perStaff[k].store === storeId);
    const bucket = {};
    ids.forEach((id) => {
      const e = perStaff[id];
      if (!e) return;
      if (storeId && e.store !== storeId) return;
      const st = storeById[e.store];
      const closeMin = st ? st.closeMin : 1260;
      const dur = totalFor(staffById[id], picks, services).durationMin;
      if (!dur) return;
      usableStarts(e.slots, dur, slotMin, closeMin).forEach((s) => {
        if (!bucket[s]) bucket[s] = [];
        bucket[s].push(id);
      });
    });
    return Object.keys(bucket).map(Number).sort((a, b) => a - b)
      .map((s) => ({ startMin: s, staffIds: bucket[s] }));
  }, [date, picks, services, staffId, storeId, availability, slotMin, storeById, staffById]);

  const [slotStaff, setSlotStaff] = useState("");

  const monthCells = useMemo(() => {
    const a = parseDate(monthAnchor);
    const first = new Date(a.getFullYear(), a.getMonth(), 1);
    const shift = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - shift);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const ds = fmtDate(d);
      return {
        date: ds,
        inMonth: d.getMonth() === a.getMonth(),
        open: !!dayHasRoom[ds],
        store: staffId ? staffStoreDays[ds] : storeId,
      };
    });
  }, [monthAnchor, dayHasRoom, staffId, staffStoreDays, storeId]);

  /* ----- 操作 ----- */

  function chooseEntry(kind) {
    setEntry(kind);
    setStep(0);
    setStoreId(""); setStaffId(""); setPicks([]);
    setDate(""); setStartMin(null); setSlotStaff("");
  }

  function toggleService(sv) {
    setPicks((prev) => {
      const has = prev.some((x) => x.serviceId === sv.id);
      return has
        ? prev.filter((x) => x.serviceId !== sv.id)
        : [...prev, { serviceId: sv.id, tierId: defaultTierId(sv), addonIds: [] }];
    });
    setDate(""); setStartMin(null);
  }

  function setTier(svId, tierId) {
    setPicks((prev) => prev.map((x) => (x.serviceId === svId ? { ...x, tierId } : x)));
    setDate(""); setStartMin(null);
  }

  function toggleAddon(svId, addonId) {
    setPicks((prev) => prev.map((x) => {
      if (x.serviceId !== svId) return x;
      const on = (x.addonIds || []).includes(addonId);
      return { ...x, addonIds: on ? x.addonIds.filter((a) => a !== addonId) : [...(x.addonIds || []), addonId] };
    }));
    setDate(""); setStartMin(null);
  }

  function pickSlot(slot) {
    setStartMin(slot.startMin);
    setSlotStaff(staffId || slot.staffIds[0]);
  }

  function setF(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  /** 「染髮（中長）」這種顯示名稱 */
  function svcLabel(p) {
    const sv = services.find((s) => s.id === p.serviceId);
    if (!sv) return "";
    const t = tierById(sv, p.tierId);
    const labels = [];
    if (t && t.label) labels.push(t.label);
    (p.addonIds || []).forEach((aid) => {
      const ad = addonsOf(sv).find((a) => a.id === aid);
      if (ad) labels.push(ad.label);
    });
    return sv.name + (labels.length ? "（" + labels.join("、") + "）" : "");
  }

  const contactReady = form.customerName.trim().length > 0 && isValidPhone(form.phone);

  // 最終確定的設計師與分店
  const finalStaffId = staffId || slotStaff;
  const finalStoreId = staffId
    ? (staffStoreDays[date] || "")
    : storeId;

  async function submit() {
    if (!contactReady || startMin === null) return;
    setSubmitting(true);
    setSubmitError("");
    const st = staffById[finalStaffId];
    const store = storeById[finalStoreId];
    const actual = totalFor(st, picks, services);
    const row = {
      req_date: date,
      start_min: startMin,
      duration_min: actual.durationMin,
      store_id: finalStoreId || null,
      store_name: store ? store.name : null,
      staff_id: finalStaffId || null,
      staff_name: st ? st.name : null,
      service_ids: picks,
      service_names: picks.map((p) => svcLabel(p)).join("、"),
      est_price: actual.price,
      customer_name: form.customerName.trim(),
      phone: form.phone.trim(),
      line_id: form.lineId.trim() || null,
      line_user_id: form.lineUserId || null,
      is_new_customer: form.isNewCustomer,
      wanted_service: form.isNewCustomer ? (form.wantedService.trim() || null) : null,
      allergies: form.isNewCustomer ? (form.allergies.trim() || null) : null,
      found_us_from: form.isNewCustomer ? form.foundUsFrom : null,
      note: form.note.trim() || null,
      status: "pending",
    };
    // 不加 .select()，客人沒有讀取權限
    const { error } = await supabase.from("booking_requests").insert(row);
    if (error) {
      setSubmitError("送出失敗，請稍後再試一次，或直接來電預約。");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setDone(true);
  }

  /* ----- 樣式 ----- */

  const styleTag = (
    <style>{`
      ${FONT_IMPORT}
      * { box-sizing: border-box; }
      body { margin: 0; }

      .bk-wrap { font-family: ${SANS}; background: ${PAPER}; color: ${INK}; min-height: 100vh; padding: 0 0 104px; }
      .bk-inner { max-width: 520px; margin: 0 auto; width: 100%; padding: 0 20px; }
      .bk-inner > .bk-title:first-child { padding-top: 26px; }

      /* ---------- 頁首：滿版靛藍色塊 ---------- */
      .bk-head { position: relative; margin: 0 -20px 20px; padding: 22px 20px 18px; overflow: hidden; }
      .bk-head::before {
        content: ""; position: absolute; top: 0; bottom: 0; left: 50%;
        width: 100vw; transform: translateX(-50%); background: ${INDIGO};
      }
      .bk-head > * { position: relative; }
      .bk-head-hero { padding: 30px 20px 34px; margin-bottom: 24px; }
      .head-motif { position: absolute; fill: ${INDIGO_MOTIF}; pointer-events: none; }
      .head-motif-a { top: -54px; left: -50px; width: 180px; height: 180px; opacity: 0.17; }
      .head-motif-b { bottom: -80px; right: -44px; width: 200px; height: 200px; opacity: 0.15; }
      .head-motif-c { top: -56px; right: -38px; width: 150px; height: 150px; opacity: 0.16; }

      .bk-eyebrow { font-size: 11.5px; font-weight: 500; letter-spacing: 0.18em;
                    text-transform: uppercase; color: #BACDE7; margin-bottom: 11px; }
      .bk-brand { display: flex; align-items: center; gap: 11px; }
      .bk-mark { flex-shrink: 0; fill: #A8C6E8; width: 30px; height: 30px; }
      .bk-head:not(.bk-head-hero) .bk-mark { width: 23px; height: 23px; }

      .bk-title { font-family: ${SERIF}; font-size: 26px; font-weight: 700; letter-spacing: 0.01em; color: ${INK}; }
      .bk-head .bk-title { color: #FFFFFF; }
      .bk-head-hero .bk-title { font-size: 28px; }
      .bk-head:not(.bk-head-hero) .bk-title { font-size: 19px; }
      .bk-sub { font-size: 13px; color: ${MUTED}; margin-top: 9px; line-height: 1.6; }
      .bk-head .bk-sub { color: #C4D4EA; }
      .bk-head:not(.bk-head-hero) .bk-sub { font-size: 11.5px; margin-top: 8px; color: #BACDE7; }

      /* ---------- 進度條 ---------- */
      .dots { display: flex; gap: 6px; margin: 0 0 20px; }
      .dot { width: 100%; height: 3px; border-radius: 2px; background: #DCD8CC; }
      .dot-done { background: ${SKY}; }
      .dot-now { background: ${INDIGO}; }

      /* ---------- 標題 ---------- */
      .step-head { font-family: ${SERIF}; font-size: 20px; font-weight: 700; margin-bottom: 6px; }
      .step-hint { font-size: 12.5px; color: ${MUTED}; margin-bottom: 16px; line-height: 1.6; }
      .sec-title { display: flex; align-items: center; gap: 10px; margin: 30px 0 14px;
                   font-family: ${SERIF}; font-size: 16px; font-weight: 700; color: ${INK}; }
      .sec-title::after { content: ""; flex-grow: 1; height: 1px; background: #D9D5CA; }

      .card { background: ${PAPER_RAISED}; border-radius: 12px; padding: 16px; box-shadow: ${liftOf(SKY)}; }

      /* ---------- 首頁兩個入口 ---------- */
      .entry-card {
        display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
        font-family: inherit; color: ${INK}; background: ${PAPER_RAISED};
        border: none; border-radius: 10px; padding: 15px 16px;
        cursor: pointer; margin-bottom: 12px; box-shadow: ${liftOf(SKY)};
      }
      .entry-card:hover { background: ${BRASS_LIGHT}; box-shadow: ${liftOf(INDIGO)}; }
      .entry-ico { width: 44px; height: 44px; border-radius: 50%; background: #EFEAD9; color: #21467F;
                   display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .entry-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .entry-t { display: block; font-size: 15.5px; font-weight: 600; }
      .entry-s { display: block; font-size: 12px; color: ${MUTED}; line-height: 1.5; }

      /* ---------- 分店卡（流程中可點選的那種） ---------- */
      .store-card {
        display: block; width: 100%; text-align: left; font-family: inherit; color: ${INK};
        background: ${PAPER_RAISED}; border: none; border-radius: 10px; padding: 0;
        cursor: pointer; margin-bottom: 12px; overflow: hidden; box-shadow: ${liftOf(SKY)};
      }
      .store-card-on, .store-card-on:hover { background: ${BRASS_LIGHT}; box-shadow: ${liftOf(INDIGO)}; }
      .store-logo-wrap { height: 84px; display: flex; align-items: center; justify-content: center;
                         background: #FFFFFF; padding: 12px; }
      .store-logo { max-height: 58px; max-width: 68%; object-fit: contain; }
      .store-body { padding: 13px 15px; }
      .store-name { font-family: ${SERIF}; font-size: 16px; font-weight: 700; }
      .store-meta { display: flex; gap: 6px; align-items: flex-start; margin-top: 4px;
                    font-size: 11.5px; color: ${MUTED}; line-height: 1.6; }

      /* ---------- 首頁「各店位置與停車資訊」 ----------
         整張卡不可點，只有店址與停車場位置兩行是連結。 */
      .store-info { display: flex; align-items: flex-start; gap: 14px; padding: 16px; cursor: default; }
      .store-info:hover { background: ${PAPER_RAISED}; }
      .store-logo-tile { width: 62px; height: 62px; flex-shrink: 0; border-radius: 12px;
                         background: #FFFFFF; border: 1px solid #E7E4DB; overflow: hidden;
                         display: flex; align-items: center; justify-content: center; }
      .store-logo-tile img { max-width: 50px; max-height: 50px; object-fit: contain; }
      .store-info .store-body { padding: 0; flex: 1; min-width: 0; }
      .store-info .store-name { margin-bottom: 7px; }
      .map-link {
        display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
        font-size: 12px; line-height: 1.5; color: var(--accent, ${INDIGO});
        text-decoration: underline; text-underline-offset: 3px; text-decoration-thickness: 1px;
      }
      .map-link:hover { filter: brightness(0.82); }
      .tap-hint { display: flex; align-items: center; gap: 5px; margin-top: 7px;
                  font-size: 10.5px; line-height: 1.4; color: #9AA6B8; }

      /* ---------- 設計師卡 ---------- */
      .staff-card {
        display: flex; gap: 13px; align-items: center; width: 100%; text-align: left;
        font-family: inherit; color: ${INK}; background: ${PAPER_RAISED};
        border: none; border-radius: 10px; padding: 13px 14px;
        cursor: pointer; margin-bottom: 10px; box-shadow: ${liftOf(SKY)};
      }
      .staff-card-on, .staff-card-on:hover { background: ${BRASS_LIGHT}; box-shadow: ${liftOf(INDIGO)}; }
      .avatar-img { border-radius: 50%; object-fit: cover; object-position: 50% 22%;
                    flex-shrink: 0; background: ${SAGE_LIGHT}; }
      .avatar-ph { border-radius: 50%; background: ${SAGE_LIGHT}; color: ${INDIGO}; flex-shrink: 0;
                   display: flex; align-items: center; justify-content: center;
                   font-family: ${SERIF}; font-weight: 700; }
      .staff-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .staff-name { font-size: 15px; font-weight: 600; }
      .staff-title { font-size: 11.5px; color: ${MUTED}; }
      .staff-blurb { font-size: 12.5px; color: ${MUTED}; margin-top: 5px; line-height: 1.55; }
      .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .tag { font-size: 10.5px; padding: 2px 8px; border-radius: 999px; background: ${SAGE_LIGHT}; color: #2F6C8E; }
      .tag-store { background: ${BRASS_LIGHT}; color: ${INDIGO}; }

      /* ---------- 服務選項 ---------- */
      .opt {
        display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
        text-align: left; font-family: inherit; font-size: 14px; color: ${INK};
        background: ${PAPER_RAISED}; border: none; border-radius: 10px; padding: 13px 15px;
        cursor: pointer; margin-bottom: 8px; box-shadow: 0 2px 0 0 #DCD8CC;
      }
      .opt:hover { box-shadow: 0 2px 0 0 ${SKY}; }
      .opt-on, .opt-on:hover { background: ${BRASS_LIGHT}; box-shadow: 0 2px 0 0 ${INDIGO}; }
      .opt-meta { font-variant-numeric: tabular-nums; font-size: 12px; color: ${MUTED}; white-space: nowrap; }
      .opt-on .opt-meta { color: ${INDIGO}; }
      .tick { width: 20px; height: 20px; border-radius: 50%; border: 1.6px solid #C3CBD8; background: #FFFFFF;
              display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .tick-on { background: ${INDIGO}; border-color: ${INDIGO}; color: #FFFFFF; }

      .tier-label { font-size: 11px; color: ${MUTED}; margin: 2px 0 5px 4px; }
      .tier-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; padding-left: 4px; }
      .tier { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; font-family: inherit;
              padding: 7px 11px; border-radius: 8px; border: 1px solid #E2DED3;
              background: ${PAPER_RAISED}; color: ${MUTED}; cursor: pointer; }
      .tier:hover { border-color: ${INDIGO}; }
      .tier-on, .tier-on:hover { background: ${BRASS_LIGHT}; border-color: ${INDIGO}; color: ${INDIGO}; }
      .tier-t { font-size: 12.5px; font-weight: 600; }
      .tier-p { font-variant-numeric: tabular-nums; font-size: 11.5px; opacity: 0.85; }
      .tier-add { border-style: dashed; }

      /* ---------- 月曆 ---------- */
      .mon-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .mon-label { font-family: ${SERIF}; font-size: 15.5px; font-weight: 700; }
      .mon-head { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
      .mon-head span { text-align: center; font-size: 11px; color: #97A2B3; }
      .mon-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .mon-cell {
        aspect-ratio: 1 / 1; border-radius: 8px; border: none; background: transparent; padding: 0;
        font-family: ${SANS}; font-variant-numeric: tabular-nums; font-size: 13px; color: #46546B;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
        cursor: not-allowed;
      }
      .mon-open { background: ${BRASS_LIGHT}; color: ${INK}; font-weight: 600; cursor: pointer; }
      .mon-open:hover { background: #DCE7F5; }
      .mon-on, .mon-on:hover { background: ${INDIGO}; color: #FFFFFF; font-weight: 600; }
      .mon-out { opacity: 0.3; }
      .mon-tag { font-size: 8.5px; line-height: 1; opacity: 0.85; }
      .mon-pip { width: 4px; height: 4px; border-radius: 50%; background: ${INDIGO}; }
      .mon-on .mon-pip { background: #FFFFFF; }

      /* ---------- 時段 ---------- */
      .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 8px; }
      .slot { font-family: ${SANS}; font-variant-numeric: tabular-nums; font-size: 13.5px;
              padding: 11px 4px; border-radius: 8px; border: 1px solid #E2DED3;
              background: ${PAPER_RAISED}; color: #33415A; cursor: pointer; }
      .slot:hover { border-color: ${INDIGO}; background: ${BRASS_LIGHT}; }
      .slot-on, .slot-on:hover { background: ${INDIGO}; border-color: ${INDIGO}; color: #FFFFFF; font-weight: 600; }

      /* ---------- 表單 ---------- */
      .lbl { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: #97A2B3; margin-bottom: 13px; }
      .inp { font-family: ${SANS}; font-size: 14.5px; color: ${INK}; background: ${PAPER_RAISED};
             border: 1px solid #E2DED3; border-radius: 10px; padding: 11px 13px; outline: none;
             width: 100%; resize: vertical; }
      .inp::placeholder { color: #B7BEC9; }
      .inp:focus { border-color: ${INDIGO}; box-shadow: 0 0 0 2px rgba(46,94,166,0.15); }
      .seg { display: flex; gap: 8px; }
      .seg button { flex: 1; font-family: inherit; font-size: 13.5px; padding: 11px 8px; border-radius: 9px;
                    border: 1px solid #E2DED3; background: ${PAPER_RAISED}; color: ${MUTED}; cursor: pointer; }
      .seg button.on { background: ${INDIGO}; border-color: ${INDIGO}; color: #FFFFFF; font-weight: 600; }

      /* ---------- 摘要與提示 ---------- */
      .summary { background: ${PAPER_RAISED}; border-radius: 12px; padding: 6px 16px; margin-bottom: 16px;
                 box-shadow: ${liftOf(INDIGO)}; }
      .summary-row { display: flex; gap: 14px; padding: 10px 0; font-size: 13.5px; color: ${INK};
                     border-bottom: 1px solid #EAE7DE; }
      .summary-row:last-child { border-bottom: none; }
      .summary-row span:first-child { width: 56px; flex-shrink: 0; padding-top: 1px; font-size: 12px; color: #8D99AB; }
      .summary-row span:last-child { font-weight: 500; line-height: 1.5; }

      .note-band { display: flex; gap: 9px; align-items: flex-start; background: ${BRASS_LIGHT}; color: #2B5286;
                   padding: 12px 14px; border-radius: 10px; font-size: 12.5px; line-height: 1.6; }
      .err-band { display: flex; gap: 9px; align-items: flex-start; background: ${WINE_LIGHT}; color: ${WINE};
                  padding: 12px 14px; border-radius: 10px; font-size: 13px; line-height: 1.6; margin-bottom: 12px; }

      /* ---------- 底部操作列 ---------- */
      .navbar { position: fixed; bottom: 0; left: 0; right: 0; max-width: 560px; margin: 0 auto;
                display: flex; gap: 12px; padding: 13px 20px 18px;
                background: ${PAPER}; border-top: 1px solid ${PAPER_LINE}; }
      .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
             height: 48px; padding: 0 20px; border-radius: 10px; border: 1px solid ${PAPER_LINE};
             background: ${PAPER_RAISED}; color: #42536B; cursor: pointer;
             font-family: inherit; font-size: 14.5px; font-weight: 600; }
      .btn-main { flex: 1; background: ${INDIGO}; border-color: ${INDIGO}; color: #FFFFFF;
                  box-shadow: 0 8px 18px -10px rgba(27,76,158,0.8); }
      .btn-main:hover { background: ${INDIGO_DEEP}; }
      .btn:disabled { opacity: 0.45; cursor: not-allowed; }
      .btn-main:disabled { opacity: 1; background: #C7CBD2; border-color: #C7CBD2; color: #FFFFFF; box-shadow: none; }

      .center-state { text-align: center; padding: 60px 20px; color: ${MUTED}; font-size: 14px; line-height: 1.8; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .spin { animation: spin 1s linear infinite; }
    `}</style>
  );

  /* ----- 載入中 / 錯誤 / 完成 ----- */

  if (loading) {
    return <div className="bk-wrap">{styleTag}
      <div className="center-state"><Loader2 size={22} className="spin" /><br />載入可預約時段…</div>
    </div>;
  }

  if (loadError) {
    return <div className="bk-wrap">{styleTag}
      <div className="bk-inner">
        <div className="bk-title">{salonName}</div>
        <div className="center-state"><AlertCircle size={22} color={WINE} /><br />{loadError}</div>
      </div>
    </div>;
  }

  if (done) {
    const st = staffById[finalStaffId];
    const store = storeById[finalStoreId];
    return <div className="bk-wrap">{styleTag}
      <div className="bk-inner">
        <div className="center-state" style={{ color: INK }}>
          <PartyPopper size={34} color={SAGE} />
          <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, margin: "14px 0 8px" }}>
            預約申請已送出
          </div>
          <div style={{ fontSize: 14, color: MUTED, marginBottom: 20 }}>
            我們會盡快與您確認，確認後會用電話或 LINE 通知您。
          </div>
        </div>
        <div className="summary">
          <div className="summary-row"><span>分店</span><span>{store ? store.name : "—"}</span></div>
          {store && store.address && (
            <div className="summary-row"><span>地址</span><span>{store.address}</span></div>
          )}
          <div className="summary-row"><span>日期</span><span>{niceDate(date)}</span></div>
          <div className="summary-row"><span>時間</span><span>{toHHMM(startMin)}–{toHHMM(startMin + totalFor(st, picks, services).durationMin)}</span></div>
          <div className="summary-row"><span>設計師</span><span>{st ? st.name : "由店家安排"}</span></div>
          <div className="summary-row"><span>服務</span><span>{picks.map((p) => svcLabel(p)).join("、")}</span></div>
          <div className="summary-row"><span>金額</span><span>{fmtFrom(totalFor(st, picks, services).price)}</span></div>
          <div className="summary-row"><span>姓名</span><span>{form.customerName}</span></div>
        </div>
        <div className="note-band" style={{ marginBottom: 10 }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          這是預約申請，還不是確認完成的預約。收到我們的確認通知後才算正式成立。
        </div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.7, padding: "0 2px" }}>
          {PRICE_NOTE}
        </div>
      </div>
    </div>;
  }

  /* ----- 入口選擇 ----- */

  if (!entry) {
    return <div className="bk-wrap">{styleTag}
      <div className="bk-inner">
        <div className="bk-head bk-head-hero">
          <Motif className="head-motif head-motif-a" />
          <Motif className="head-motif head-motif-b" round />
          <div className="bk-eyebrow">LUZ STYLE</div>
          <div className="bk-brand">
            <Motif className="bk-mark" />
            <div className="bk-title">{salonName}</div>
          </div>
          <div className="bk-sub">{config.notice}</div>
        </div>

        <button className="entry-card" onClick={() => chooseEntry("store")}>
          <span className="entry-ico"><Store size={22} strokeWidth={1.6} /></span>
          <span className="entry-text">
            <span className="entry-t">依分店預約</span>
            <span className="entry-s">先選店，再看那天有哪些設計師</span>
          </span>
          <span style={{ marginLeft: "auto" }}><ChevronRight size={18} color="#A6B4C7" /></span>
        </button>
        <button className="entry-card" onClick={() => chooseEntry("staff")}>
          <span className="entry-ico"><Users size={22} strokeWidth={1.6} /></span>
          <span className="entry-text">
            <span className="entry-t">依設計師預約</span>
            <span className="entry-s">先選設計師，再看他哪幾天在哪家店</span>
          </span>
          <span style={{ marginLeft: "auto" }}><ChevronRight size={18} color="#A6B4C7" /></span>
        </button>

        {/* 各店位置與停車資訊 —— 整張卡不可點，只有店址與停車場兩行是連結 */}
        <div className="sec-title">各店位置與停車資訊</div>
        {stores.map((s) => {
          const accent = accentOf(s.id);
          return (
            <div key={s.id} className="store-card store-info"
              style={{ "--accent": accent, boxShadow: liftOf(accent) }}>
              {s.logo && (
                <span className="store-logo-tile">
                  <img src={s.logo} alt={s.name} loading="lazy" />
                </span>
              )}
              <div className="store-body">
                <div className="store-name">{s.name}</div>
                {s.address && (
                  <>
                    <a className="map-link" href={storeMapUrl(s)} target="_blank" rel="noreferrer">
                      <MapPin size={13} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                      <span>{s.address}</span>
                    </a>
                    <a className="map-link" href={parkingMapUrl(s)} target="_blank" rel="noreferrer">
                      <SquareParking size={13} strokeWidth={1.7} style={{ flexShrink: 0 }} />
                      <span>停車場位置</span>
                    </a>
                    <div className="tap-hint">
                      <Pointer size={11} strokeWidth={2} style={{ flexShrink: 0 }} />
                      <span>點地址或停車場位置，直接開啟 Google 地圖</span>
                    </div>
                  </>
                )}
                {!s.address && (
                  <div className="store-meta">
                    <Clock size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                    {toHHMM(s.openMin)}–{toHHMM(s.closeMin)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>;
  }

  /* ----- 步驟定義 ----- */

  const pickWhoStep = entry === "store"
    ? {
        head: "選擇分店",
        hint: "看看哪一家離你比較近。",
        body: (
          <div>
            {stores.map((s) => (
              <button key={s.id} className={"store-card" + (storeId === s.id ? " store-card-on" : "")}
                onClick={() => { setStoreId(s.id); setDate(""); setStartMin(null); }}>
                {s.logo && <div className="store-logo-wrap"><img className="store-logo" src={s.logo} alt={s.name} loading="lazy" /></div>}
                <div className="store-body">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={"tick" + (storeId === s.id ? " tick-on" : "")} style={{ width: 18, height: 18 }}>
                      {storeId === s.id && <Check size={11} />}
                    </span>
                    <span className="store-name">{s.name}</span>
                  </div>
                  {s.address && <div className="store-meta"><MapPin size={12} style={{ marginTop: 2, flexShrink: 0 }} />{s.address}</div>}
                  <div className="store-meta"><Clock size={12} style={{ marginTop: 2, flexShrink: 0 }} />{toHHMM(s.openMin)}–{toHHMM(s.closeMin)}</div>
                </div>
              </button>
            ))}
          </div>
        ),
        canNext: !!storeId,
      }
    : {
        head: "選擇設計師",
        hint: "選好之後會顯示他在哪幾天、哪家店有空。",
        body: (
          <div>
            {designers.length === 0 ? (
              <div className="card" style={{ color: MUTED, fontSize: 13 }}>目前沒有可預約的設計師。</div>
            ) : designers.map((d) => {
              const on = staffId === d.id;
              const inStores = (storesOfStaff[d.id] || []).map((sid) => storeById[sid] && storeById[sid].name).filter(Boolean);
              return (
                <button key={d.id} className={"staff-card" + (on ? " staff-card-on" : "")}
                  onClick={() => { setStaffId(d.id); setDate(""); setStartMin(null); }}>
                  <Avatar photo={d.photo} name={d.name} size={58} />
                  <span className="staff-text">
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span className="staff-name">{d.name}</span>
                      <span className="staff-title">{d.title}</span>
                    </span>
                    {d.blurb && <span className="staff-blurb" style={{ display: "block" }}>{d.blurb}</span>}
                    <span className="tags">
                      {inStores.map((n) => <span key={n} className="tag tag-store">{n}</span>)}
                      {(d.specialties || []).map((sp) => <span key={sp} className="tag">{sp}</span>)}
                    </span>
                  </span>
                  {on && <Check size={17} color={BRASS} />}
                </button>
              );
            })}
          </div>
        ),
        canNext: !!staffId,
      };

  const steps = [
    pickWhoStep,
    {
      head: "想做什麼服務？",
      hint: "可以複選，時間會自動加總。不確定的話先選最主要的，到店再討論。",
      body: (
        <div className="card">
          {services.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13 }}>目前沒有可預約的服務項目。</div>
          ) : services.map((sv) => {
            const pick = picks.find((x) => x.serviceId === sv.id);
            const on = !!pick;
            const pool = candidateStaff.length ? candidateStaff : [null];
            // 這個服務所有分級、所有可能設計師的價格與時間範圍
            const es = [];
            tiersOf(sv).forEach((t) => pool.forEach((d) => es.push(effectiveTier(d, sv, t.id))));
            const ps = es.map((e) => e.price);
            const ds = es.map((e) => e.durationMin);
            const anyFrom = es.some((e) => e.from);

            return (
              <div key={sv.id} style={{ marginBottom: on ? 12 : 0 }}>
                <button className={"opt" + (on ? " opt-on" : "")} onClick={() => toggleService(sv)}
                  style={{ marginBottom: on ? 7 : 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span className={"tick" + (on ? " tick-on" : "")}>{on && <Check size={13} />}</span>
                    {sv.name}
                  </span>
                  <span className="opt-meta">
                    {fmtRange(Math.min(...ds), Math.max(...ds))} 分
                    {Math.max(...ps) > 0 && "　" + fmtRange(Math.min(...ps), Math.max(...ps), fmtMoney) + " 起"}
                  </span>
                </button>

                {on && hasTiers(sv) && (
                  <>
                    <div className="tier-label">長度／方案</div>
                    <div className="tier-row">
                      {tiersOf(sv).map((t) => {
                        const sel = pick.tierId === t.id;
                        const te = effectiveTier(staffById[staffId] || candidateStaff[0] || null, sv, t.id);
                        return (
                          <button key={t.id} className={"tier" + (sel ? " tier-on" : "")}
                            onClick={() => setTier(sv.id, t.id)}>
                            <span className="tier-t">{t.label || "標準"}</span>
                            <span className="tier-p">{fmtMoney(te.price)}{t.from ? " 起" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {on && addonsOf(sv).length > 0 && (
                  <>
                    <div className="tier-label">加選</div>
                    <div className="tier-row">
                      {addonsOf(sv).map((a) => {
                        const sel = (pick.addonIds || []).includes(a.id);
                        return (
                          <button key={a.id} className={"tier tier-add" + (sel ? " tier-on" : "")}
                            onClick={() => toggleAddon(sv.id, a.id)}>
                            <span className="tier-t">{sel ? "✓ " : "+ "}{a.label}</span>
                            <span className="tier-p">{fmtMoney(a.price)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {picks.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <span style={{ color: MUTED }}>共 {fmtRange(range.minDur, range.maxDur)} 分鐘</span>
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {fmtRange(range.minPrice, range.maxPrice, fmtMoney)} 起
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 7, lineHeight: 1.6 }}>
                {range.minPrice !== range.maxPrice && "價格與時間依設計師而異。"}
                {PRICE_NOTE}
              </div>
            </div>
          )}
        </div>
      ),
      canNext: picks.length > 0,
    },
    {
      head: "選一個時間",
      hint: entry === "staff"
        ? "有底色的日子還有位子，日期下方是那天所在的分店。"
        : "有底色的日子還有位子。選定時段後會顯示由誰服務與實際金額。",
      body: (
        <div className="card">
          <div className="mon-bar">
            <button className="btn" style={{ padding: "7px 10px" }} onClick={() => {
              const d = parseDate(monthAnchor); d.setDate(1); d.setMonth(d.getMonth() - 1); setMonthAnchor(fmtDate(d));
            }}><ChevronLeft size={16} /></button>
            <div className="mon-label">{parseDate(monthAnchor).getFullYear()} 年 {parseDate(monthAnchor).getMonth() + 1} 月</div>
            <button className="btn" style={{ padding: "7px 10px" }} onClick={() => {
              const d = parseDate(monthAnchor); d.setDate(1); d.setMonth(d.getMonth() + 1); setMonthAnchor(fmtDate(d));
            }}><ChevronRight size={16} /></button>
          </div>
          <div className="mon-head">{["一", "二", "三", "四", "五", "六", "日"].map((w) => <span key={w}>{w}</span>)}</div>
          <div className="mon-grid">
            {monthCells.map((c) => {
              const stName = c.store && storeById[c.store] ? storeById[c.store].name : "";
              return (
                <button key={c.date} disabled={!c.open}
                  className={"mon-cell" + (c.open ? " mon-open" : "") + (date === c.date ? " mon-on" : "") + (c.inMonth ? "" : " mon-out")}
                  onClick={() => { setDate(c.date); setStartMin(null); }}>
                  {parseDate(c.date).getDate()}
                  {c.open && entry === "staff" && stName
                    ? <span className="mon-tag">{stName}</span>
                    : c.open && <span className="mon-pip" />}
                </button>
              );
            })}
          </div>

          {date && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid " + PAPER_LINE }}>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 10, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Clock size={13} /> {niceDate(date)} 可預約的時間
                {entry === "staff" && staffStoreDays[date] && storeById[staffStoreDays[date]] && (
                  <span style={{ color: BRASS }}>· {storeById[staffStoreDays[date]].name}</span>
                )}
              </div>
              {slotsForDate.length === 0 ? (
                <div style={{ fontSize: 13, color: MUTED }}>這天已經約滿了，換一天看看。</div>
              ) : (
                <div className="slot-grid">
                  {slotsForDate.map((s) => (
                    <button key={s.startMin} className={"slot" + (startMin === s.startMin ? " slot-on" : "")}
                      onClick={() => pickSlot(s)}>
                      {toHHMM(s.startMin)}
                    </button>
                  ))}
                </div>
              )}
              {entry === "store" && startMin !== null && slotStaff && staffById[slotStaff] && (
                <div style={{
                  marginTop: 12, padding: "10px 12px", borderRadius: 9, background: SAGE_LIGHT,
                  fontSize: 12.5, color: SAGE, display: "flex", alignItems: "center", gap: 9,
                }}>
                  <Avatar photo={staffById[slotStaff].photo} name={staffById[slotStaff].name} size={30} />
                  <span>
                    這個時段由 <strong>{staffById[slotStaff].name}</strong> 為您服務
                    <br />
                    {(() => {
                      const t = totalOf(slotStaff);
                      return t.durationMin + " 分鐘　" + fmtFrom(t.price);
                    })()}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      ),
      canNext: !!date && startMin !== null,
    },
    {
      head: "留一下聯絡方式",
      hint: "我們確認時段後會用電話或 LINE 通知您。",
      body: (
        <div>
          <div className="summary">
            <div className="summary-row"><span>分店</span><span>{storeById[finalStoreId] ? storeById[finalStoreId].name : "—"}</span></div>
            <div className="summary-row"><span>日期</span><span>{niceDate(date)}</span></div>
            <div className="summary-row"><span>時間</span><span>{toHHMM(startMin)}–{toHHMM(startMin + totalOf(finalStaffId).durationMin)}</span></div>
            <div className="summary-row"><span>設計師</span><span>{staffById[finalStaffId] ? staffById[finalStaffId].name : "由店家安排"}</span></div>
            <div className="summary-row"><span>服務</span><span>{picks.map((p) => svcLabel(p)).join("、")}</span></div>
            <div className="summary-row"><span>金額</span><span>{fmtFrom(totalOf(finalStaffId).price)}</span></div>
          </div>
          <div className="note-band" style={{ marginTop: -6, marginBottom: 16 }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            {PRICE_NOTE}
          </div>

          <div className="card">
            <div className="lbl">
              您是第一次來嗎？
              <div className="seg">
                <button className={form.isNewCustomer ? "on" : ""} onClick={() => setF("isNewCustomer", true)}>第一次</button>
                <button className={!form.isNewCustomer ? "on" : ""} onClick={() => setF("isNewCustomer", false)}>來過了</button>
              </div>
            </div>

            <label className="lbl">姓名
              <input className="inp" value={form.customerName} onChange={(e) => setF("customerName", e.target.value)} placeholder="王小明" maxLength={40} />
            </label>
            <label className="lbl">手機號碼
              <input className="inp" type="tel" inputMode="tel" value={form.phone}
                onChange={(e) => setF("phone", e.target.value)} placeholder="0912345678" maxLength={30} />
              {form.phone && !isValidPhone(form.phone) && (
                <span style={{ color: WINE, fontSize: 11.5 }}>手機號碼看起來不完整，請再確認一次。</span>
              )}
            </label>
            <label className="lbl">LINE ID<span style={{ fontSize: 11 }}>（選填，方便我們用 LINE 通知您）</span>
              <input className="inp" value={form.lineId} onChange={(e) => setF("lineId", e.target.value)} maxLength={60} />
            </label>

            {liffReady && (
              <div className="lbl" style={{ marginTop: 2 }}>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 6 }}>想在預約確認的第一時間收到 LINE 通知嗎？</div>
                {form.lineUserId ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                    borderRadius: 9, background: SAGE_LIGHT, color: SAGE, fontSize: 13,
                  }}>
                    <Check size={15} style={{ flexShrink: 0 }} />
                    已連結 LINE{form.lineDisplayName ? "：" + form.lineDisplayName : ""}，確認後會通知您
                  </div>
                ) : (
                  <button type="button" className="btn" onClick={handleLineLogin} disabled={liffBusy}
                    style={{ width: "100%", justifyContent: "center" }}>
                    {liffBusy ? <><Loader2 size={15} className="spin" /> 連接中…</> : <>用 LINE 登入，接收預約確認通知</>}
                  </button>
                )}
                {liffError && <span style={{ color: WINE, fontSize: 11.5 }}>{liffError}</span>}
              </div>
            )}

            {form.isNewCustomer && (
              <>
                <div style={{ height: 1, background: PAPER_LINE, margin: "4px 0 14px" }} />
                <label className="lbl">想做的髮型或效果<span style={{ fontSize: 11 }}>（選填，講得越具體我們越好準備）</span>
                  <textarea className="inp" rows={2} value={form.wantedService}
                    onChange={(e) => setF("wantedService", e.target.value)}
                    placeholder="例如：想染淺一點但不要漂太傷" maxLength={300} />
                </label>
                <label className="lbl">頭皮或染劑過敏、皮膚敏感<span style={{ fontSize: 11 }}>（選填，但有的話請務必告訴我們）</span>
                  <input className="inp" value={form.allergies} onChange={(e) => setF("allergies", e.target.value)} maxLength={200} />
                </label>
                <label className="lbl">怎麼知道我們的？
                  <select className="inp" value={form.foundUsFrom} onChange={(e) => setF("foundUsFrom", e.target.value)}>
                    {FOUND_US_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
              </>
            )}

            <label className="lbl" style={{ marginBottom: 4 }}>其他想告訴我們的事<span style={{ fontSize: 11 }}>（選填）</span>
              <textarea className="inp" rows={2} value={form.note} onChange={(e) => setF("note", e.target.value)} maxLength={500} />
            </label>
          </div>

          {submitError && (
            <div className="err-band" style={{ marginTop: 12, marginBottom: 0 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{submitError}
            </div>
          )}
          <div className="note-band" style={{ marginTop: 12 }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            送出後我們會與您確認時段，確認通知發出後預約才正式成立。
          </div>
        </div>
      ),
      canNext: contactReady,
    },
  ];

  const cur = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="bk-wrap">{styleTag}
      <div className="bk-inner">
        <div className="bk-head">
          <Motif className="head-motif head-motif-c" />
          <div className="bk-brand">
            <Motif className="bk-mark" />
            <div className="bk-title">{salonName}</div>
          </div>
          <div className="bk-sub">
            {entry === "store" ? "依分店預約" : "依設計師預約"}
            {storeId && storeById[storeId] ? "　·　" + storeById[storeId].name : ""}
            {staffId && staffById[staffId] ? "　·　" + staffById[staffId].name : ""}
          </div>
        </div>

        <StepDots step={step} total={steps.length} />

        <div className="step-head">{cur.head}</div>
        <div className="step-hint">{cur.hint}</div>
        {cur.body}
      </div>

      <div className="navbar">
        <button className="btn" disabled={submitting}
          onClick={() => (step > 0 ? setStep(step - 1) : chooseEntry(""))}>
          <ChevronLeft size={16} /> {step > 0 ? "上一步" : "重選"}
        </button>
        {isLast ? (
          <button className="btn btn-main" onClick={submit} disabled={!cur.canNext || submitting}>
            {submitting ? <><Loader2 size={16} className="spin" /> 送出中…</> : <>送出預約申請</>}
          </button>
        ) : (
          <button className="btn btn-main" onClick={() => setStep(step + 1)} disabled={!cur.canNext}>
            下一步 <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
