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
import { supabase } from "./supabaseClient";
import {
  Check, ChevronLeft, ChevronRight, Clock, MapPin, Store, Users,
  AlertCircle, Loader2, PartyPopper, Scissors,
} from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`;

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const PAPER_RAISED = "#FCFAF3";
const BRASS = "#A9812F";
const BRASS_LIGHT = "#F4E7C8";
const WINE = "#7B3B34";
const WINE_LIGHT = "#F2E1DE";
const SAGE = "#4F6B4F";
const SAGE_LIGHT = "#E3EADD";
const MUTED = "#8A8072";

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
function niceDate(s) {
  const d = parseDate(s);
  return (d.getMonth() + 1) + " 月 " + d.getDate() + " 日（" + weekdayOf(s) + "）";
}
function isValidPhone(p) {
  const digits = String(p || "").replace(/[^0-9]/g, "");
  return digits.length >= 8 && digits.length <= 15;
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
  const [pickedServices, setPickedServices] = useState([]);
  const [monthAnchor, setMonthAnchor] = useState(todayStr());
  const [date, setDate] = useState("");
  const [startMin, setStartMin] = useState(null);

  const [form, setForm] = useState({
    customerName: "", phone: "", lineId: "", isNewCustomer: true,
    wantedService: "", allergies: "", foundUsFrom: FOUND_US_OPTIONS[0], note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

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

  const stores = (config && config.stores) || [];
  const designers = (config && config.designers) || [];
  const services = (config && config.services) || [];
  const slotMin = (config && config.slotMin) || 15;
  const salonName = (config && config.salonName) || "線上預約";

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

  const duration = useMemo(
    () => pickedServices.reduce((t, s) => t + (s.durationMin || 0), 0), [pickedServices]);
  const estPrice = useMemo(
    () => pickedServices.reduce((t, s) => t + (s.price || 0), 0), [pickedServices]);

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
        return usableStarts(e.slots, duration, slotMin, closeMin).length > 0;
      });
    });
    return out;
  }, [availability, duration, staffId, storeId, slotMin, storeById]);

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
      usableStarts(e.slots, duration, slotMin, closeMin).forEach((s) => {
        if (!bucket[s]) bucket[s] = [];
        bucket[s].push(id);
      });
    });
    return Object.keys(bucket).map(Number).sort((a, b) => a - b)
      .map((s) => ({ startMin: s, staffIds: bucket[s] }));
  }, [date, duration, staffId, storeId, availability, slotMin, storeById]);

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
    setStoreId(""); setStaffId(""); setPickedServices([]);
    setDate(""); setStartMin(null); setSlotStaff("");
  }

  function toggleService(sv) {
    setPickedServices((prev) => {
      const has = prev.some((x) => x.id === sv.id);
      return has ? prev.filter((x) => x.id !== sv.id) : [...prev, sv];
    });
    setDate(""); setStartMin(null);
  }

  function pickSlot(slot) {
    setStartMin(slot.startMin);
    setSlotStaff(staffId || slot.staffIds[0]);
  }

  function setF(key, value) { setForm((f) => ({ ...f, [key]: value })); }

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
    const row = {
      req_date: date,
      start_min: startMin,
      duration_min: duration,
      store_id: finalStoreId || null,
      store_name: store ? store.name : null,
      staff_id: finalStaffId || null,
      staff_name: st ? st.name : null,
      service_ids: pickedServices.map((s) => s.id),
      service_names: pickedServices.map((s) => s.name).join("、"),
      est_price: estPrice,
      customer_name: form.customerName.trim(),
      phone: form.phone.trim(),
      line_id: form.lineId.trim() || null,
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
      .bk-wrap { font-family: 'IBM Plex Sans', sans-serif; background: ${PAPER}; color: ${INK}; min-height: 100vh; padding: 22px 16px 96px; }
      .bk-inner { max-width: 520px; margin: 0 auto; }
      .bk-title { font-family: 'Fraunces', serif; font-size: 27px; font-weight: 700; letter-spacing: 0.01em; }
      .bk-sub { font-size: 13px; color: ${MUTED}; margin-top: 5px; line-height: 1.6; }
      .dots { display: flex; gap: 6px; margin: 18px 0 20px; }
      .dot { width: 100%; height: 3px; border-radius: 2px; background: ${PAPER_LINE}; }
      .dot-done { background: ${SAGE}; }
      .dot-now { background: ${INK}; }
      .step-head { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; margin-bottom: 4px; }
      .step-hint { font-size: 12.5px; color: ${MUTED}; margin-bottom: 14px; line-height: 1.6; }
      .card { background: ${PAPER_RAISED}; border: 1px solid ${PAPER_LINE}; border-radius: 12px; padding: 16px; }

      .entry-card {
        display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
        font-family: inherit; color: ${INK}; background: ${PAPER_RAISED};
        border: 1px solid ${PAPER_LINE}; border-radius: 14px; padding: 20px 18px;
        cursor: pointer; margin-bottom: 12px;
      }
      .entry-card:hover { border-color: ${BRASS}; background: ${BRASS_LIGHT}; }
      .entry-ico { width: 46px; height: 46px; border-radius: 12px; background: ${SAGE_LIGHT}; color: ${SAGE};
                   display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .entry-t { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; }
      .entry-s { font-size: 12.5px; color: ${MUTED}; margin-top: 3px; line-height: 1.5; }

      .store-card {
        display: block; width: 100%; text-align: left; font-family: inherit; color: ${INK};
        background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 12px;
        padding: 0; cursor: pointer; margin-bottom: 12px; overflow: hidden;
      }
      .store-card:hover { border-color: ${BRASS}; }
      .store-card-on { border-color: ${BRASS}; background: ${BRASS_LIGHT}; }
      .store-logo-wrap { height: 92px; display: flex; align-items: center; justify-content: center;
                         background: ${PAPER}; border-bottom: 1px solid ${PAPER_LINE}; padding: 12px; }
      .store-logo { max-height: 68px; max-width: 74%; object-fit: contain; }
      .store-body { padding: 12px 14px; }
      .store-name { font-family: 'Fraunces', serif; font-size: 17px; font-weight: 600; }
      .store-meta { font-size: 12px; color: ${MUTED}; margin-top: 4px; line-height: 1.6; display: flex; gap: 5px; align-items: flex-start; }

      .staff-card {
        display: flex; gap: 13px; width: 100%; text-align: left; font-family: inherit; color: ${INK};
        background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 12px;
        padding: 13px 14px; cursor: pointer; margin-bottom: 10px; align-items: center;
      }
      .staff-card:hover { border-color: ${BRASS}; }
      .staff-card-on { border-color: ${BRASS}; background: ${BRASS_LIGHT}; }
      .avatar-img { border-radius: 50%; object-fit: cover; object-position: 50% 22%; flex-shrink: 0; background: ${SAGE_LIGHT}; }
      .avatar-ph { border-radius: 50%; background: ${SAGE_LIGHT}; color: ${SAGE}; display: flex;
                   align-items: center; justify-content: center; font-family: 'Fraunces', serif; font-weight: 600; flex-shrink: 0; }
      .staff-name { font-size: 15px; font-weight: 600; }
      .staff-title { font-size: 11.5px; color: ${MUTED}; }
      .staff-blurb { font-size: 12.5px; color: ${MUTED}; margin-top: 5px; line-height: 1.55; }
      .tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .tag { font-size: 10.5px; padding: 2px 7px; border-radius: 999px; background: ${SAGE_LIGHT}; color: ${SAGE}; }
      .tag-store { background: ${BRASS_LIGHT}; color: ${BRASS}; }

      .opt {
        display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
        text-align: left; font-family: inherit; font-size: 14px; color: ${INK};
        background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 10px;
        padding: 13px 14px; cursor: pointer; margin-bottom: 8px;
      }
      .opt:hover { border-color: ${BRASS}; }
      .opt-on { background: ${BRASS_LIGHT}; border-color: ${BRASS}; }
      .opt-meta { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: ${MUTED}; white-space: nowrap; }
      .opt-on .opt-meta { color: ${BRASS}; }
      .tick { width: 20px; height: 20px; border-radius: 50%; border: 1px solid ${PAPER_LINE}; display: flex;
              align-items: center; justify-content: center; flex-shrink: 0; background: #FFFDF8; }
      .tick-on { background: ${INK}; border-color: ${INK}; color: ${PAPER}; }

      .mon-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      .mon-label { font-family: 'Fraunces', serif; font-size: 16px; font-weight: 600; }
      .mon-head { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
      .mon-head span { text-align: center; font-size: 11px; color: ${MUTED}; }
      .mon-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
      .mon-cell {
        aspect-ratio: 1 / 1; border-radius: 8px; border: 1px solid transparent; background: transparent;
        font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: ${MUTED};
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
        cursor: not-allowed; padding: 0;
      }
      .mon-open { background: #FFFDF8; border-color: ${PAPER_LINE}; color: ${INK}; cursor: pointer; font-weight: 600; }
      .mon-open:hover { border-color: ${BRASS}; background: ${BRASS_LIGHT}; }
      .mon-on { background: ${INK}; border-color: ${INK}; color: ${PAPER}; }
      .mon-out { opacity: 0.25; }
      .mon-tag { font-size: 8.5px; line-height: 1; opacity: 0.85; }
      .mon-pip { width: 4px; height: 4px; border-radius: 50%; background: ${SAGE}; }
      .mon-on .mon-pip { background: ${PAPER}; }

      .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 7px; }
      .slot { font-family: 'IBM Plex Mono', monospace; font-size: 13.5px; padding: 11px 4px; border-radius: 8px;
              border: 1px solid ${PAPER_LINE}; background: #FFFDF8; color: ${INK}; cursor: pointer; }
      .slot:hover { border-color: ${BRASS}; background: ${BRASS_LIGHT}; }
      .slot-on { background: ${INK}; border-color: ${INK}; color: ${PAPER}; }

      .lbl { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: ${MUTED}; margin-bottom: 13px; }
      .inp { font-family: 'IBM Plex Sans', sans-serif; font-size: 15px; color: ${INK}; background: #FFFDF8;
             border: 1px solid ${PAPER_LINE}; border-radius: 8px; padding: 11px 12px; outline: none; width: 100%; resize: vertical; }
      .inp:focus { border-color: ${BRASS}; box-shadow: 0 0 0 2px rgba(169,129,47,0.15); }
      .seg { display: flex; gap: 8px; }
      .seg button { flex: 1; font-family: inherit; font-size: 13.5px; padding: 11px 8px; border-radius: 8px;
                    border: 1px solid ${PAPER_LINE}; background: #FFFDF8; color: ${MUTED}; cursor: pointer; }
      .seg button.on { background: ${INK}; border-color: ${INK}; color: ${PAPER}; }

      .summary { background: ${SAGE_LIGHT}; border-radius: 10px; padding: 13px 15px; margin-bottom: 16px; }
      .summary-row { display: flex; gap: 10px; font-size: 13.5px; padding: 3px 0; color: ${INK}; }
      .summary-row span:first-child { color: ${SAGE}; width: 52px; flex-shrink: 0; }
      .note-band { display: flex; gap: 8px; align-items: flex-start; background: ${BRASS_LIGHT}; color: ${BRASS};
                   padding: 11px 13px; border-radius: 9px; font-size: 12.5px; line-height: 1.6; }
      .err-band { display: flex; gap: 8px; align-items: flex-start; background: ${WINE_LIGHT}; color: ${WINE};
                  padding: 11px 13px; border-radius: 9px; font-size: 13px; line-height: 1.6; margin-bottom: 12px; }

      .navbar { position: fixed; bottom: 0; left: 0; right: 0; background: ${PAPER};
                border-top: 1px solid ${PAPER_LINE}; padding: 12px 16px; display: flex; gap: 10px;
                max-width: 552px; margin: 0 auto; }
      .btn { font-family: inherit; font-size: 15px; font-weight: 500; border-radius: 9px; padding: 13px 18px;
             border: 1px solid ${PAPER_LINE}; background: #FFFDF8; color: ${INK}; cursor: pointer;
             display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
      .btn-main { flex: 1; background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
      .btn:disabled { opacity: 0.4; cursor: not-allowed; }
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
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 21, fontWeight: 600, margin: "14px 0 8px" }}>
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
          <div className="summary-row"><span>時間</span><span>{toHHMM(startMin)}–{toHHMM(startMin + duration)}</span></div>
          <div className="summary-row"><span>設計師</span><span>{st ? st.name : "由店家安排"}</span></div>
          <div className="summary-row"><span>服務</span><span>{pickedServices.map((s) => s.name).join("、")}</span></div>
          <div className="summary-row"><span>姓名</span><span>{form.customerName}</span></div>
        </div>
        <div className="note-band">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          這是預約申請，還不是確認完成的預約。收到我們的確認通知後才算正式成立。
        </div>
      </div>
    </div>;
  }

  /* ----- 入口選擇 ----- */

  if (!entry) {
    return <div className="bk-wrap">{styleTag}
      <div className="bk-inner">
        <div className="bk-title">{salonName}</div>
        <div className="bk-sub">{config.notice}</div>
        <div style={{ height: 26 }} />
        <button className="entry-card" onClick={() => chooseEntry("store")}>
          <span className="entry-ico"><Store size={22} /></span>
          <span>
            <span className="entry-t">依分店預約</span>
            <span className="entry-s">先選店，再看那天有哪些設計師</span>
          </span>
          <span style={{ marginLeft: "auto" }}><ChevronRight size={18} color={MUTED} /></span>
        </button>
        <button className="entry-card" onClick={() => chooseEntry("staff")}>
          <span className="entry-ico"><Users size={22} /></span>
          <span>
            <span className="entry-t">指定設計師</span>
            <span className="entry-s">先選設計師，再看他哪幾天在哪家店</span>
          </span>
          <span style={{ marginLeft: "auto" }}><ChevronRight size={18} color={MUTED} /></span>
        </button>

        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>我們的分店</div>
          {stores.map((s) => (
            <div key={s.id} className="store-card" style={{ cursor: "default" }}>
              {s.logo && <div className="store-logo-wrap"><img className="store-logo" src={s.logo} alt={s.name} loading="lazy" /></div>}
              <div className="store-body">
                <div className="store-name">{s.name}</div>
                {s.address && <div className="store-meta"><MapPin size={12} style={{ marginTop: 2, flexShrink: 0 }} />{s.address}</div>}
                <div className="store-meta"><Clock size={12} style={{ marginTop: 2, flexShrink: 0 }} />{toHHMM(s.openMin)}–{toHHMM(s.closeMin)}</div>
              </div>
            </div>
          ))}
        </div>
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
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span className="staff-name">{d.name}</span>
                      <span className="staff-title">{d.title}</span>
                    </span>
                    {d.blurb && <span className="staff-blurb">{d.blurb}</span>}
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
            const on = pickedServices.some((x) => x.id === sv.id);
            return (
              <button key={sv.id} className={"opt" + (on ? " opt-on" : "")} onClick={() => toggleService(sv)}>
                <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span className={"tick" + (on ? " tick-on" : "")}>{on && <Check size={13} />}</span>
                  {sv.name}
                </span>
                <span className="opt-meta">{sv.durationMin} 分{sv.price ? "　" + fmtMoney(sv.price) : ""}</span>
              </button>
            );
          })}
          {duration > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE,
                          display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
              <span style={{ color: MUTED }}>共 {duration} 分鐘</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>約 {fmtMoney(estPrice)}</span>
            </div>
          )}
        </div>
      ),
      canNext: pickedServices.length > 0,
    },
    {
      head: "選一個時間",
      hint: entry === "staff"
        ? "有底色的日子還有位子，日期下方是那天所在的分店。"
        : "有底色的日子還有位子。時間顯示的是開始時間。",
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
                <div style={{ marginTop: 12, fontSize: 12.5, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar photo={staffById[slotStaff].photo} name={staffById[slotStaff].name} size={28} />
                  這個時段由 {staffById[slotStaff].name} 為您服務
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
            <div className="summary-row"><span>時間</span><span>{toHHMM(startMin)}–{toHHMM(startMin + duration)}</span></div>
            <div className="summary-row"><span>設計師</span><span>{staffById[finalStaffId] ? staffById[finalStaffId].name : "由店家安排"}</span></div>
            <div className="summary-row"><span>服務</span><span>{pickedServices.map((s) => s.name).join("、")}　約 {fmtMoney(estPrice)}</span></div>
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
        <div className="bk-title">{salonName}</div>
        <div className="bk-sub">
          {entry === "store" ? "依分店預約" : "指定設計師預約"}
          {storeId && storeById[storeId] ? "　·　" + storeById[storeId].name : ""}
          {staffId && staffById[staffId] ? "　·　" + staffById[staffId].name : ""}
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
