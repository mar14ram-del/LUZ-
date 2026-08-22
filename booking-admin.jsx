// =====================================================================
// 後台：空檔發布 + 預約申請收件匣
//
// 匯出兩個東西：
//   publishAvailability(...)  — 把空檔與服務清單發布到公開表
//   <BookingInbox />          — 客人送來的申請，審核後轉成正式預約
// =====================================================================

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { storeName } from "./stores";
import { storeOfStaffOn, normalizeRoster } from "./roster";
import { effectiveTier, addonsOf, defaultTierId } from "./services";
import {
  Inbox, Check, X, RefreshCw, UploadCloud, AlertTriangle, Phone,
  UserPlus, Link2, Clock, Loader2, CircleAlert, Sparkles,
} from "lucide-react";

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
const LIVE_STATUSES = ["pending", "confirmed", "arrived", "done"];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}
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
function todayStr() {
  return fmtDate(new Date());
}
function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function weekdayOf(s) {
  return WEEKDAY_ZH[parseDate(s).getDay()];
}
function fmtMoney(n) {
  return "NT$" + (Math.round(Number(n) || 0)).toLocaleString("zh-TW");
}
function digitsOf(p) {
  return String(p || "").replace(/[^0-9]/g, "");
}
function isDesigner(s) {
  const r = s.role || s.type || "";
  if (!r) return true;
  return /designer|設計/i.test(r);
}
function overlaps(aStart, aDur, bStart, bDur) {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

// =====================================================================
// 發布空檔
// 實際邏輯已移到 booking-sync.jsx（自動發布與手動發布共用同一份計算，
// 確保兩者算出來的空檔永遠一致）。這裡只是轉出去，維持舊的 import 相容。
// =====================================================================
export { publishAvailability, publishConfig, publishDays, publishFullWindow } from "./booking-sync";
import { publishFullWindow } from "./booking-sync";

// =====================================================================
// 發布按鈕（放在預約管理的工具列）
// =====================================================================
export function PublishButton({ appointments, staff, services, settings, closedDates, onDone }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const r = await publishFullWindow({ appointments, staff, services, settings, closedDates });
      setMsg("已發布未來 " + r.days + " 天的空檔");
      if (onDone) onDone(r);
    } catch (e) {
      setMsg("發布失敗：" + (e.message || "請檢查 Supabase 連線"));
    }
    setBusy(false);
    setTimeout(() => setMsg(""), 4000);
  }

  return (
    <>
      <button className="ledger-btn" onClick={run} disabled={busy} title="把最新空檔發布到公開預約頁">
        {busy ? <Loader2 size={14} className="ba-spin" /> : <UploadCloud size={14} />}
        {busy ? "發布中…" : "發布空檔"}
      </button>
      {msg && <span style={{ fontSize: 12, color: msg.startsWith("發布失敗") ? WINE : SAGE }}>{msg}</span>}
    </>
  );
}

// =====================================================================
// 待確認筆數
// 給外面的按鈕顯示用。只查數量不抓資料，很輕。
// =====================================================================

export function usePendingRequestCount(intervalMs) {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    const { count: c, error } = await supabase
      .from("booking_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (!error) setCount(c || 0);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, intervalMs || 180000);
    return () => clearInterval(t);
  }, [load, intervalMs]);
  return { count, refresh: load };
}

// =====================================================================
// 預約申請收件匣
// =====================================================================
export function BookingInbox({ appointments, customers, staff, services, roster, onApprove, onCreateCustomer, onHandled }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHandled, setShowHandled] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [assign, setAssign] = useState({});   // requestId -> staffId 覆寫
  const [linkTo, setLinkTo] = useState({});   // requestId -> customerId 覆寫

  const designers = useMemo(() => (staff || []).filter(isDesigner), [staff]);
  const staffMap = useMemo(() => {
    const m = {};
    (staff || []).forEach((s) => { m[s.id] = s; });
    return m;
  }, [staff]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    let q = supabase
      .from("booking_requests")
      .select("*")
      .order("req_date", { ascending: true })
      .order("start_min", { ascending: true });
    if (!showHandled) q = q.eq("status", "pending");
    else q = q.gte("req_date", addDays(todayStr(), -30));
    const { data, error: err } = await q;
    if (err) setError("讀取申請失敗：" + err.message);
    else setRequests(data || []);
    setLoading(false);
  }, [showHandled]);

  useEffect(() => { load(); }, [load]);

  // 自動每 3 分鐘檢查一次有沒有新申請
  useEffect(() => {
    const t = setInterval(() => { if (!showHandled) load(); }, 180000);
    return () => clearInterval(t);
  }, [load, showHandled]);

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  function matchCustomer(req) {
    const d = digitsOf(req.phone);
    if (!d) return null;
    const byPhone = (customers || []).find((c) => digitsOf(c.phone) && digitsOf(c.phone) === d);
    if (byPhone) return { c: byPhone, how: "手機號碼相同" };
    const name = (req.customer_name || "").trim();
    if (name) {
      const byName = (customers || []).filter((c) => (c.name || "").trim() === name);
      if (byName.length === 1) return { c: byName[0], how: "姓名相同（手機不同，請確認）" };
    }
    return null;
  }

  function conflictsFor(req, staffId) {
    if (!staffId) return [];
    return (appointments || []).filter(
      (a) =>
        a.date === req.req_date &&
        a.staffId === staffId &&
        LIVE_STATUSES.includes(a.status) &&
        overlaps(req.start_min, req.duration_min, Number(a.startMin) || 0, Number(a.durationMin) || 0)
    );
  }

  async function approve(req) {
    const staffId = assign[req.id] || req.staff_id || "";
    if (!staffId) return;
    setWorkingId(req.id);

    const match = matchCustomer(req);
    let customerId = linkTo[req.id] !== undefined ? linkTo[req.id] : (match ? match.c.id : "");

    // 需要建新顧客
    if (customerId === "__new__") {
      const fresh = {
        id: uid(),
        name: req.customer_name,
        phone: req.phone,
        lineId: req.line_id || "",
        allergies: req.allergies || "",
        preferredStylistId: staffId,
        source: req.found_us_from || "其他",
        notes: [req.wanted_service ? "想做：" + req.wanted_service : "", req.note || ""].filter(Boolean).join("\n"),
        createdDate: todayStr(),
      };
      if (onCreateCustomer) {
        const created = await onCreateCustomer(fresh);
        customerId = (created && created.id) || fresh.id;
      } else {
        customerId = "";
      }
    }

    const svcIds = Array.isArray(req.service_ids) ? req.service_ids : [];
    // 用實際指派到的設計師的價目重算，而不是客人送出時看到的
    const r = normalizeRoster(roster);
    // 客人送出的是 [{serviceId, tierId, addonIds}]；舊格式則是純 id 陣列
    const picks = svcIds.map((x) =>
      typeof x === "string" ? { serviceId: x, tierId: "", addonIds: [] } : x
    );
    const svcObjs = picks.map((pk) => {
      const sv = (services || []).find((s) => s.id === pk.serviceId);
      if (!sv) return null;
      const tid = pk.tierId || defaultTierId(sv);
      const e = effectiveTier(r, staffId, sv, tid);
      let price = e.price;
      let dur = e.durationMin;
      const labels = [];
      if (e.label) labels.push(e.label);
      (pk.addonIds || []).forEach((aid) => {
        const ad = addonsOf(sv).find((a) => a.id === aid);
        if (ad) { price += Number(ad.price) || 0; dur += Number(ad.durationMin) || 0; labels.push(ad.label); }
      });
      return {
        serviceId: sv.id, id: sv.id, tierId: tid, addonIds: pk.addonIds || [],
        name: sv.name + (labels.length ? "（" + labels.join("、") + "）" : ""),
        durationMin: dur, price,
      };
    }).filter(Boolean);

    const recalcDur = svcObjs.reduce((t, x) => t + (x.durationMin || 0), 0);
    const recalcPrice = svcObjs.reduce((t, x) => t + (x.price || 0), 0);

    const appt = {
      id: uid(),
      storeId: rosterStore || req.store_id || "",
      date: req.req_date,
      startMin: req.start_min,
      durationMin: recalcDur || req.duration_min,
      durationEdited: true,
      customerId: customerId || "",
      guestName: customerId ? "" : req.customer_name,
      guestPhone: customerId ? "" : req.phone,
      staffId,
      services: svcObjs.length ? svcObjs : (req.service_names ? [{ serviceId: "req", id: "req", tierId: "", addonIds: [], name: req.service_names, durationMin: req.duration_min, price: Number(req.est_price) || 0 }] : []),
      price: recalcPrice || Number(req.est_price) || 0,
      status: "confirmed",
      source: "線上預約",
      note: [
        req.wanted_service ? "想做：" + req.wanted_service : "",
        req.note || "",
        req.is_new_customer ? "（線上預約自稱新客）" : "",
      ].filter(Boolean).join("\n"),
      createdAt: new Date().toISOString(),
    };

    if (onApprove) onApprove(appt);

    const { error: err } = await supabase
      .from("booking_requests")
      .update({ status: "approved", handled_at: new Date().toISOString(), matched_customer_id: customerId || null })
      .eq("id", req.id);

    if (err) setError("已建立預約，但更新申請狀態失敗：" + err.message);
    setWorkingId("");
    load();
    if (onHandled) onHandled();
  }

  async function reject(req) {
    setWorkingId(req.id);
    const { error: err } = await supabase
      .from("booking_requests")
      .update({ status: "rejected", handled_at: new Date().toISOString() })
      .eq("id", req.id);
    if (err) setError("退回失敗：" + err.message);
    setWorkingId("");
    load();
    if (onHandled) onHandled();
  }

  return (
    <div>
      <style>{`
        @keyframes ba-spin { to { transform: rotate(360deg); } }
        .ba-spin { animation: ba-spin 1s linear infinite; }
        .req-card { background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 10px; padding: 14px; margin-bottom: 10px; }
        .req-card-new { border-left: 3px solid ${BRASS}; }
        .req-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
        .req-when { font-family: 'IBM Plex Mono', monospace; font-size: 14px; font-weight: 600; }
        .req-meta { font-size: 12.5px; color: ${MUTED}; line-height: 1.7; }
        .req-band { display: flex; gap: 7px; align-items: flex-start; padding: 8px 11px; border-radius: 7px; font-size: 12.5px; line-height: 1.6; margin-bottom: 8px; }
        .req-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px dashed ${PAPER_LINE}; }
        .req-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px; border-radius: 999px; font-weight: 600; }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
          <Inbox size={17} /> 待確認預約
          {pendingCount > 0 && (
            <span style={{ background: BRASS, color: "white", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>
              {pendingCount}
            </span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button className="ledger-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} className="ba-spin" /> : <RefreshCw size={14} />} 重新讀取
        </button>
        <button className={"chip" + (showHandled ? " chip-on" : "")} onClick={() => setShowHandled((v) => !v)}>
          {showHandled ? "顯示全部（近 30 天）" : "只看待處理"}
        </button>
      </div>

      {error && (
        <div className="req-band" style={{ background: WINE_LIGHT, color: WINE }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{error}
        </div>
      )}

      {loading && requests.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 13 }}>
          <Loader2 size={20} className="ba-spin" /><br />讀取中…
        </div>
      ) : requests.length === 0 ? (
        <div style={{ padding: 44, textAlign: "center", color: MUTED, fontSize: 13, lineHeight: 1.8 }}>
          目前沒有待處理的申請。<br />
          客人從公開預約頁送出後，這裡就會出現。
        </div>
      ) : requests.map((req) => {
        const match = matchCustomer(req);
        const chosenStaff = assign[req.id] || req.staff_id || "";
        const clashes = conflictsFor(req, chosenStaff);
        const linkChoice = linkTo[req.id] !== undefined ? linkTo[req.id] : (match ? match.c.id : "__new__");
        const busy = workingId === req.id;
        const handled = req.status !== "pending";

        return (
          <div key={req.id} className={"req-card" + (handled ? "" : " req-card-new")} style={{ opacity: handled ? 0.62 : 1 }}>
            <div className="req-top">
              <div>
                <div className="req-when">
                  {req.req_date}（{weekdayOf(req.req_date)}）{toHHMM(req.start_min)}–{toHHMM(req.start_min + req.duration_min)}
                </div>
                <div className="req-meta">
                  {req.customer_name}　<Phone size={11} style={{ verticalAlign: -1 }} /> {req.phone}
                  {req.line_id ? "　LINE: " + req.line_id : ""}
                  <br />
                  {req.service_names || "未選服務"}　約 {fmtMoney(req.est_price)}
                  {req.staff_name ? "　指定：" + req.staff_name : "　未指定設計師"}
                  {req.store_name ? "　分店：" + req.store_name : ""}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                {handled && (
                  <span className="req-tag" style={{
                    background: req.status === "approved" ? SAGE_LIGHT : "#EFEDE7",
                    color: req.status === "approved" ? SAGE : MUTED,
                  }}>
                    {req.status === "approved" ? "已確認" : "已退回"}
                  </span>
                )}
                {req.is_new_customer && (
                  <span className="req-tag" style={{ background: BRASS_LIGHT, color: BRASS }}>
                    <Sparkles size={10} /> 新客
                  </span>
                )}
              </div>
            </div>

            {req.allergies && (
              <div className="req-band" style={{ background: WINE_LIGHT, color: WINE }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                客人自述過敏 / 敏感：{req.allergies}
              </div>
            )}
            {req.wanted_service && (
              <div className="req-band" style={{ background: PAPER, color: INK }}>
                <Clock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                想做：{req.wanted_service}
              </div>
            )}
            {req.note && (
              <div className="req-band" style={{ background: PAPER, color: INK }}>
                <Clock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                備註：{req.note}
              </div>
            )}
            {clashes.length > 0 && !handled && (
              <div className="req-band" style={{ background: WINE_LIGHT, color: WINE }}>
                <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                {staffMap[chosenStaff] ? staffMap[chosenStaff].name : ""} 這個時段已有預約
                （{clashes.map((c) => toHHMM(c.startMin) + "–" + toHHMM(c.startMin + c.durationMin)).join("、")}），
                請換設計師或退回請客人改期。
              </div>
            )}
            {!handled && chosenStaff && req.store_id && (() => {
              const at = storeOfStaffOn(normalizeRoster(roster), chosenStaff, req.req_date);
              if (!at) return (
                <div className="req-band" style={{ background: WINE_LIGHT, color: WINE }}>
                  <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {staffMap[chosenStaff] ? staffMap[chosenStaff].name : ""} 當天沒有排班，請換人或先到「設計師與班表」補上。
                </div>
              );
              if (at !== req.store_id) return (
                <div className="req-band" style={{ background: BRASS_LIGHT, color: BRASS }}>
                  <CircleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  客人選的是 {req.store_name || storeName(req.store_id)}，但這位設計師當天在 {storeName(at)}。
                  確認後預約會記在 {storeName(at)}。
                </div>
              );
              return null;
            })()}
            {match && !handled && (
              <div className="req-band" style={{ background: SAGE_LIGHT, color: SAGE }}>
                <Link2 size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                比對到既有顧客「{match.c.name}」（{match.how}）
                {match.c.allergies ? "，資料裡記著：" + match.c.allergies : ""}
                {(match.c.noShowCount || 0) >= 2 ? "，有 " + match.c.noShowCount + " 次未到記錄" : ""}
              </div>
            )}

            {!handled && (
              <div className="req-row">
                <label style={{ fontSize: 12, color: MUTED }}>設計師</label>
                <select
                  className="ledger-input" style={{ width: "auto" }}
                  value={chosenStaff}
                  onChange={(e) => setAssign((p) => ({ ...p, [req.id]: e.target.value }))}
                >
                  <option value="">— 請指派 —</option>
                  {designers.map((d) => {
                    const at = storeOfStaffOn(normalizeRoster(roster), d.id, req.req_date);
                    const label = at
                      ? d.name + "（" + storeName(at) + "）"
                      : d.name + "（當天休假）";
                    return <option key={d.id} value={d.id}>{label}</option>;
                  })}
                </select>

                <label style={{ fontSize: 12, color: MUTED, marginLeft: 6 }}>顧客</label>
                <select
                  className="ledger-input" style={{ width: "auto" }}
                  value={linkChoice}
                  onChange={(e) => setLinkTo((p) => ({ ...p, [req.id]: e.target.value }))}
                >
                  <option value="__new__">建立新顧客資料</option>
                  <option value="">不建檔，記為臨時顧客</option>
                  {(customers || [])
                    .slice()
                    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-TW"))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{c.phone ? "（" + c.phone + "）" : ""}
                      </option>
                    ))}
                </select>

                <div style={{ flex: 1 }} />
                <button className="ledger-btn" onClick={() => reject(req)} disabled={busy}>
                  <X size={14} /> 退回
                </button>
                <button
                  className="ledger-btn ledger-btn-primary"
                  onClick={() => approve(req)}
                  disabled={busy || !chosenStaff}
                  title={!chosenStaff ? "請先指派設計師" : "建立正式預約"}
                >
                  {busy ? <Loader2 size={14} className="ba-spin" /> : <Check size={14} />} 確認並建立預約
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 14, fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
        確認後預約會以「已確認」狀態進到班表，公開頁的時段會自動更新。
        選「建立新顧客資料」會把姓名、電話、LINE ID、過敏記錄一起寫進顧客模組。
      </div>
    </div>
  );
}
