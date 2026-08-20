// =====================================================================
// booking-sync.jsx — 空檔自動發布（多店版）
//
// 每天發布的資料長這樣：
//   { "設計師id": { store: "luz", slots: [600, 615, 630, ...] } }
//
// 因為一位設計師一天只在一家店，所以「這個人今天在哪」和
// 「這個人今天有哪些空檔」可以合在一起。撞單問題自然消失——
// 設計師的時間軸只有一條，塞不進去就是沒空。
//
// 這份是發布邏輯的唯一來源，手動與自動共用同一份計算。
// =====================================================================

import { useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import { STORES, getStore } from "./stores";
import { storeOfStaffOn, publicProfiles, normalizeRoster } from "./roster";

const PUBLISH_DAYS = 60;
const DEBOUNCE_MS = 2500;
const LIVE_STATUSES = ["pending", "confirmed", "arrived", "done"];

/* ---------- 工具 ---------- */

function toMin(hhmm) {
  const p = String(hhmm || "0:00").split(":");
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}
function fmtDate(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseDate(s) {
  const p = String(s || "").split("-").map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}
function todayStr() { return fmtDate(new Date()); }
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function isDesigner(s) {
  const r = s.role || s.type || "";
  if (!r) return true;
  return /designer|設計/i.test(r);
}
function overlaps(aStart, aDur, bStart, bDur) {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

/* ---------- 算出某一天的空檔 ---------- */

function computeDayPayload(day, { appointments, staff, settings, roster }) {
  const r = normalizeRoster(roster);
  const slotMin = settings.slotMin || 15;
  const designers = (staff || []).filter(isDesigner);

  // 這一天有效的預約（不分店——設計師的時間軸只有一條）
  const dayAppts = (appointments || []).filter(
    (a) => a.date === day && LIVE_STATUSES.includes(a.status)
  );

  const payload = {};
  designers.forEach((d) => {
    const storeId = storeOfStaffOn(r, d.id, day);
    if (!storeId) return;                       // 休假、公休、或沒排班

    const store = getStore(storeId);
    const openMin = toMin((store && store.openTime) || settings.openTime);
    const closeMin = toMin((store && store.closeTime) || settings.closeTime);

    const taken = dayAppts.filter((a) => a.staffId === d.id);
    const free = [];
    for (let m = openMin; m + slotMin <= closeMin; m += slotMin) {
      const clash = taken.some((a) =>
        overlaps(m, slotMin, Number(a.startMin) || 0, Number(a.durationMin) || 0)
      );
      if (!clash) free.push(m);
    }
    if (free.length) payload[d.id] = { store: storeId, slots: free };
  });
  return payload;
}

/* ---------- 發布公開設定 ---------- */

export async function publishConfig({ staff, services, settings, roster }) {
  const r = normalizeRoster(roster);
  const designers = (staff || []).filter(isDesigner);

  const payload = {
    version: 2,
    salonName: settings.salonName || "LUZ",
    notice: settings.publicNotice || "線上預約，選好時段後我們會與您確認。",
    slotMin: settings.slotMin || 15,
    stores: STORES.map((s) => ({
      id: s.id, name: s.name, logo: s.logo, address: s.address,
      phone: s.phone || "", tagline: s.tagline || "", blurb: s.blurb || "",
      openMin: toMin(s.openTime), closeMin: toMin(s.closeTime),
    })),
    services: (services || []).map((s) => ({
      id: s.id, name: s.name, durationMin: s.durationMin, price: s.price,
    })),
    designers: publicProfiles(r, designers),
  };

  const { error } = await supabase
    .from("public_config")
    .upsert({ id: 1, payload, updated_at: new Date().toISOString() });
  if (error) throw error;
  return payload;
}

/* ---------- 只發布指定的幾天 ---------- */

export async function publishDays(dates, state) {
  const start = todayStr();
  const limit = addDays(start, PUBLISH_DAYS);
  const targets = Array.from(new Set(dates)).filter((d) => d >= start && d < limit);
  if (targets.length === 0) return { days: 0 };

  const rows = targets.map((day) => ({
    day,
    payload: computeDayPayload(day, state),
    updated_at: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += 20) {
    const { error } = await supabase
      .from("public_availability")
      .upsert(rows.slice(i, i + 20), { onConflict: "day" });
    if (error) throw error;
  }
  return { days: rows.length };
}

/* ---------- 發布整個窗口 ---------- */

export async function publishFullWindow(state) {
  await publishConfig(state);
  const start = todayStr();
  const days = Array.from({ length: PUBLISH_DAYS }, (_, i) => addDays(start, i));
  const result = await publishDays(days, state);
  await supabase.from("public_availability").delete().lt("day", start);
  return { ...result, designers: (state.staff || []).filter(isDesigner).length };
}

export const publishAvailability = publishFullWindow;   // 舊名稱相容

/* ---------- 變動偵測 ---------- */

function daySignatures(appointments) {
  const map = new Map();
  (appointments || []).forEach((a) => {
    if (!LIVE_STATUSES.includes(a.status) || !a.date) return;
    const item = (a.staffId || "?") + ":" + (Number(a.startMin) || 0) + ":" + (Number(a.durationMin) || 0);
    if (!map.has(a.date)) map.set(a.date, []);
    map.get(a.date).push(item);
  });
  const out = new Map();
  map.forEach((items, date) => out.set(date, items.sort().join("|")));
  return out;
}

function configSignature({ staff, services, settings, roster }) {
  return JSON.stringify([
    (staff || []).filter(isDesigner).map((s) => s.id + ":" + s.name).sort(),
    (services || []).map((s) => s.id + ":" + s.name + ":" + s.durationMin + ":" + s.price),
    [settings.openTime, settings.closeTime, settings.slotMin, settings.salonName, settings.publicNotice],
    normalizeRoster(roster),      // 班表變了也要重發
  ]);
}

/* ---------- React hook ---------- */

export function useAutoPublish({ ready, appointments, staff, services, settings, roster, onStatus }) {
  const baseline = useRef(null);
  const cfgBaseline = useRef(null);
  const dirty = useRef(new Set());
  const timer = useRef(null);
  const firstSweep = useRef(false);
  const stateRef = useRef({});

  stateRef.current = { appointments, staff, services, settings, roster };

  function report(status, message) {
    if (onStatus) onStatus({ status, message });
  }

  // 開 app 時整批發布一次（也順便處理窗口往前滾動）
  useEffect(() => {
    if (!ready || firstSweep.current) return;
    firstSweep.current = true;
    (async () => {
      report("publishing", "同步空檔中…");
      try {
        await publishFullWindow(stateRef.current);
        baseline.current = daySignatures(appointments);
        cfgBaseline.current = configSignature(stateRef.current);
        report("ok", "空檔已是最新");
      } catch (e) {
        report("error", "自動同步失敗：" + (e.message || "請檢查連線"));
      }
    })();
  }, [ready]);

  // 之後只發布有變動的日子
  useEffect(() => {
    if (!ready || !firstSweep.current || baseline.current === null) return;

    const next = daySignatures(appointments);
    const changed = [];
    next.forEach((sig, date) => {
      if (baseline.current.get(date) !== sig) changed.push(date);
    });
    baseline.current.forEach((_, date) => {
      if (!next.has(date)) changed.push(date);
    });
    baseline.current = next;
    if (changed.length === 0) return;

    changed.forEach((d) => dirty.current.add(d));
    report("pending", "有變動，即將同步…");

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const batch = Array.from(dirty.current);
      dirty.current.clear();
      report("publishing", "同步空檔中…");
      try {
        await publishDays(batch, stateRef.current);
        report("ok", "空檔已是最新");
      } catch (e) {
        batch.forEach((d) => dirty.current.add(d));
        report("error", "自動同步失敗：" + (e.message || "請檢查連線"));
      }
    }, DEBOUNCE_MS);
  }, [appointments, ready]);

  // 班表、服務、設定改了 → 整批重發
  useEffect(() => {
    if (!ready || !firstSweep.current || cfgBaseline.current === null) return;
    const sig = configSignature(stateRef.current);
    if (sig === cfgBaseline.current) return;
    cfgBaseline.current = sig;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      report("publishing", "同步設定中…");
      try {
        await publishFullWindow(stateRef.current);
        baseline.current = daySignatures(stateRef.current.appointments);
        report("ok", "空檔已是最新");
      } catch (e) {
        report("error", "自動同步失敗：" + (e.message || "請檢查連線"));
      }
    }, DEBOUNCE_MS);
  }, [staff, services, settings, roster, ready]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current.size > 0) {
        publishDays(Array.from(dirty.current), stateRef.current).catch(() => {});
      }
    };
  }, []);

  return {
    publishNow: async () => {
      if (timer.current) clearTimeout(timer.current);
      dirty.current.clear();
      report("publishing", "同步空檔中…");
      try {
        await publishFullWindow(stateRef.current);
        baseline.current = daySignatures(stateRef.current.appointments);
        cfgBaseline.current = configSignature(stateRef.current);
        report("ok", "空檔已是最新");
        return true;
      } catch (e) {
        report("error", "同步失敗：" + (e.message || "請檢查連線"));
        return false;
      }
    },
  };
}

/* ---------- 狀態指示燈 ---------- */

export function SyncIndicator({ status, message, onPublishNow }) {
  const look = {
    idle:       { dot: "#8A8072", text: "尚未同步" },
    pending:    { dot: "#A9812F", text: message || "即將同步…" },
    publishing: { dot: "#A9812F", text: message || "同步中…" },
    ok:         { dot: "#4F6B4F", text: message || "空檔已是最新" },
    error:      { dot: "#7B3B34", text: message || "同步失敗" },
  }[status] || { dot: "#8A8072", text: "尚未同步" };

  const clickable = status === "error" || status === "idle";

  return (
    <span
      onClick={clickable && onPublishNow ? onPublishNow : undefined}
      title={clickable ? "點一下重新同步" : "空檔會自動發布到公開預約頁"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
        color: status === "error" ? "#7B3B34" : "#8A8072",
        cursor: clickable ? "pointer" : "default", whiteSpace: "nowrap",
        padding: "6px 10px", borderRadius: 999,
        background: status === "error" ? "#F2E1DE" : "transparent",
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: look.dot, flexShrink: 0,
        opacity: status === "publishing" || status === "pending" ? 0.55 : 1,
      }} />
      {look.text}
    </span>
  );
}
