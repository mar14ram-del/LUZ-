// =====================================================================
// roster.jsx — 設計師介紹與班表
//
// 資料存在 Supabase（kv_store 的 appointments:roster），
// 在後台編輯，改完即時生效，不用改程式碼也不用重新部署。
//
// 匯出兩種東西：
//   純函式  — 給預約模組和空檔發布用，判斷某人某天在哪家店
//   <RosterEditor />  — 後台的「設計師與班表」頁面
// =====================================================================

import React, { useState, useEffect, useMemo } from "react";
import {
  Save, Loader2, Check, AlertTriangle, ChevronDown, ChevronRight,
  CalendarOff, Plus, Trash2, Image as ImageIcon, Eye, EyeOff,
} from "lucide-react";
import { STORES, getStore, storeName } from "./stores";

export const ROSTER_KEY = "appointments:roster";

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

const WEEKDAYS = [
  { n: 1, label: "一" }, { n: 2, label: "二" }, { n: 3, label: "三" },
  { n: 4, label: "四" }, { n: 5, label: "五" }, { n: 6, label: "六" },
  { n: 0, label: "日" },
];

const BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.BASE_URL) || "/";

/** 把 "staff/paul.jpg" 這種相對路徑補成完整網址；已經是網址就原樣回傳 */
export function resolvePhoto(p) {
  if (!p) return "";
  if (/^https?:\/\//i.test(p) || p.startsWith("data:")) return p;
  return BASE + String(p).replace(/^\//, "");
}

/* =====================================================================
   資料結構
   ===================================================================== */

export function emptyRoster() {
  return {
    profiles: {},      // staffId -> { photo, blurb, specialties[], title, publicVisible,
                       //              rates: { 服務id: { price, durationMin } } }
    weekly: {},        // staffId -> { 0..6 -> storeId | null }
    overrides: {},     // "YYYY-MM-DD" -> { staffId -> storeId | null }
    closedDates: [],   // 兩店都公休
  };
}

export function normalizeRoster(raw) {
  const base = emptyRoster();
  if (!raw || typeof raw !== "object") return base;
  return {
    profiles: raw.profiles || {},
    weekly: raw.weekly || {},
    overrides: raw.overrides || {},
    closedDates: Array.isArray(raw.closedDates) ? raw.closedDates : [],
  };
}

/* =====================================================================
   核心判斷：某位設計師某天在哪家店
   回傳分店 id，或 null（休假 / 公休 / 未排班）
   ===================================================================== */

function weekdayOfDate(dateStr) {
  const p = String(dateStr || "").split("-").map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1).getDay();
}

export function storeOfStaffOn(roster, staffId, dateStr) {
  if (!roster || !staffId || !dateStr) return null;
  if ((roster.closedDates || []).includes(dateStr)) return null;

  const ov = roster.overrides && roster.overrides[dateStr];
  if (ov && Object.prototype.hasOwnProperty.call(ov, staffId)) {
    return ov[staffId] || null;
  }
  const week = roster.weekly && roster.weekly[staffId];
  if (!week) return null;
  return week[weekdayOfDate(dateStr)] || null;
}

/**
 * 某位設計師某個服務的實際價格與時間。
 * 沒有個別設定就沿用服務清單的預設值。
 */
export function rateOf(roster, staffId, service) {
  if (!service) return { price: 0, durationMin: 0, custom: false };
  const prof = (roster && roster.profiles && roster.profiles[staffId]) || {};
  const r = (prof.rates && prof.rates[service.id]) || {};
  const hasPrice = r.price !== undefined && r.price !== null && r.price !== "";
  const hasDur = r.durationMin !== undefined && r.durationMin !== null && r.durationMin !== "";
  return {
    price: hasPrice ? Number(r.price) : Number(service.price) || 0,
    durationMin: hasDur ? Number(r.durationMin) : Number(service.durationMin) || 0,
    custom: hasPrice || hasDur,
  };
}

/** 一組服務對某位設計師的總時間與總金額 */
export function totalFor(roster, staffId, services) {
  return (services || []).reduce(
    (acc, sv) => {
      const r = rateOf(roster, staffId, sv);
      return { price: acc.price + r.price, durationMin: acc.durationMin + r.durationMin };
    },
    { price: 0, durationMin: 0 }
  );
}

/** 某天某家店有哪些設計師 */
export function staffAtStoreOn(roster, allStaff, storeId, dateStr) {
  return (allStaff || []).filter((s) => storeOfStaffOn(roster, s.id, dateStr) === storeId);
}

/** 這位設計師公開頁看不看得到 */
export function isPublicVisible(roster, staffId) {
  const p = roster.profiles && roster.profiles[staffId];
  return !p || p.publicVisible !== false;
}

/** 產生給公開頁用的設計師介紹（含照片與擅長項目） */
export function publicProfiles(roster, allStaff) {
  return (allStaff || [])
    .filter((s) => isPublicVisible(roster, s.id))
    .filter((s) => roster.weekly && roster.weekly[s.id])   // 沒排班的不顯示
    .map((s) => {
      const p = (roster.profiles && roster.profiles[s.id]) || {};
      return {
        id: s.id,
        name: s.name,
        title: p.title || "設計師",
        photo: resolvePhoto(p.photo),
        blurb: p.blurb || "",
        specialties: p.specialties || [],
        rates: p.rates || {},
      };
    });
}

/* =====================================================================
   後台編輯頁
   ===================================================================== */

function isDesigner(s) {
  const r = s.role || s.type || "";
  if (!r) return true;
  return /designer|設計/i.test(r);
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function RosterEditor({ staff, services, roster, onSave }) {
  const [draft, setDraft] = useState(() => normalizeRoster(roster));
  const [expanded, setExpanded] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ovDate, setOvDate] = useState(todayStr());
  const [closedDraft, setClosedDraft] = useState("");

  useEffect(() => { setDraft(normalizeRoster(roster)); }, [roster]);

  const designers = useMemo(() => (staff || []).filter(isDesigner), [staff]);

  function markDirty(next) {
    setDraft(next);
    setSaved(false);
  }

  function setCell(staffId, weekday, storeId) {
    const weekly = { ...draft.weekly };
    weekly[staffId] = { ...(weekly[staffId] || {}), [weekday]: storeId || null };
    markDirty({ ...draft, weekly });
  }

  function setProfile(staffId, key, value) {
    const profiles = { ...draft.profiles };
    profiles[staffId] = { ...(profiles[staffId] || {}), [key]: value };
    markDirty({ ...draft, profiles });
  }

  function setRate(staffId, serviceId, key, value) {
    const profiles = { ...draft.profiles };
    const prof = { ...(profiles[staffId] || {}) };
    const rates = { ...(prof.rates || {}) };
    const one = { ...(rates[serviceId] || {}) };
    if (value === "" || value === null) delete one[key];
    else one[key] = Number(value);
    if (Object.keys(one).length === 0) delete rates[serviceId];
    else rates[serviceId] = one;
    prof.rates = rates;
    profiles[staffId] = prof;
    markDirty({ ...draft, profiles });
  }

  function clearRates(staffId) {
    const profiles = { ...draft.profiles };
    profiles[staffId] = { ...(profiles[staffId] || {}), rates: {} };
    markDirty({ ...draft, profiles });
  }

  function setOverride(staffId, storeId) {
    const overrides = { ...draft.overrides };
    const day = { ...(overrides[ovDate] || {}) };
    if (storeId === "__default__") delete day[staffId];
    else day[staffId] = storeId || null;
    if (Object.keys(day).length === 0) delete overrides[ovDate];
    else overrides[ovDate] = day;
    markDirty({ ...draft, overrides });
  }

  function addClosed() {
    if (!closedDraft) return;
    if (draft.closedDates.includes(closedDraft)) return;
    markDirty({ ...draft, closedDates: [...draft.closedDates, closedDraft].sort() });
    setClosedDraft("");
  }
  function removeClosed(d) {
    markDirty({ ...draft, closedDates: draft.closedDates.filter((x) => x !== d) });
  }

  async function save() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  // 每天每家店有幾位設計師（用來抓沒人顧店的日子）
  const coverage = useMemo(() => {
    const out = {};
    STORES.forEach((st) => { out[st.id] = {}; });
    WEEKDAYS.forEach((w) => {
      STORES.forEach((st) => { out[st.id][w.n] = []; });
      designers.forEach((d) => {
        const sid = (draft.weekly[d.id] || {})[w.n];
        if (sid && out[sid]) out[sid][w.n].push(d.name);
      });
    });
    return out;
  }, [draft.weekly, designers]);

  const gaps = useMemo(() => {
    const list = [];
    STORES.forEach((st) => {
      WEEKDAYS.forEach((w) => {
        if ((coverage[st.id][w.n] || []).length === 0) list.push(st.name + " 週" + w.label);
      });
    });
    return list;
  }, [coverage]);

  const unscheduled = designers.filter((d) => !draft.weekly[d.id]);

  return (
    <div>
      <style>{`
        @keyframes rs-spin { to { transform: rotate(360deg); } }
        .rs-spin { animation: rs-spin 1s linear infinite; }
        .rs-scroll { overflow-x: auto; padding-bottom: 4px; }
        .rs-grid { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 640px; }
        .rs-grid th, .rs-grid td { padding: 7px 6px; border-bottom: 1px solid ${PAPER_LINE}; }
        .rs-grid th { font-size: 11.5px; color: ${MUTED}; font-weight: 500; text-align: center; }
        .rs-grid th:first-child, .rs-grid td:first-child { text-align: left; min-width: 150px; position: sticky; left: 0; background: ${PAPER_RAISED}; z-index: 1; }
        .rs-sel {
          font-family: inherit; font-size: 12px; width: 100%; min-width: 62px; text-align: center;
          border: 1px solid ${PAPER_LINE}; border-radius: 6px; padding: 6px 2px; background: #FFFDF8;
          color: ${INK}; cursor: pointer; outline: none; appearance: none; -webkit-appearance: none;
        }
        .rs-sel:focus { border-color: ${BRASS}; }
        .rs-sel-off { color: ${MUTED}; background: transparent; border-style: dashed; }
        .rs-name { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .rs-thumb { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: ${SAGE_LIGHT}; }
        .rs-thumb-ph { width: 30px; height: 30px; border-radius: 50%; background: ${SAGE_LIGHT}; color: ${SAGE};
                       display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', serif;
                       font-weight: 600; font-size: 13px; flex-shrink: 0; }
        .rs-panel { background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 9px; padding: 14px; margin: 4px 0 10px; }
        .rs-band { display: flex; gap: 8px; align-items: flex-start; padding: 10px 13px; border-radius: 8px; font-size: 12.5px; line-height: 1.65; margin-bottom: 10px; }
        .rs-sec { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; margin: 22px 0 10px; }
        .rs-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
        .rs-closed { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-family: 'IBM Plex Mono', monospace;
                     background: ${WINE_LIGHT}; color: ${WINE}; border-radius: 999px; padding: 4px 6px 4px 11px; }
        .rs-x { cursor: pointer; opacity: 0.65; display: flex; }
        .rs-x:hover { opacity: 1; }
        .rt-table { display: flex; flex-direction: column; gap: 5px; }
        .rt-row { display: grid; grid-template-columns: 1fr 88px 100px; gap: 8px; align-items: center; }
        .rt-head { font-size: 11px; color: ${MUTED}; }
        .rt-head span:not(:first-child) { text-align: center; }
        .rt-row input { text-align: center; }
        @media (max-width: 620px) {
          .rt-row { grid-template-columns: 1fr 70px 78px; }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600 }}>設計師與班表</div>
        <div style={{ flex: 1 }} />
        {saved && <span style={{ fontSize: 12, color: SAGE, display: "flex", alignItems: "center", gap: 5 }}><Check size={13} /> 已儲存</span>}
        <button className="ledger-btn ledger-btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="rs-spin" /> : <Save size={14} />} 儲存班表
        </button>
      </div>

      {designers.length === 0 && (
        <div className="rs-band" style={{ background: WINE_LIGHT, color: WINE }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          財務模組裡還沒有設計師。先到員工頁面新增，這裡才會出現。
        </div>
      )}
      {unscheduled.length > 0 && (
        <div className="rs-band" style={{ background: BRASS_LIGHT, color: BRASS }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          {unscheduled.map((d) => d.name).join("、")} 還沒排班，公開預約頁不會顯示這些人。
        </div>
      )}
      {gaps.length > 0 && (
        <div className="rs-band" style={{ background: PAPER, color: MUTED }}>
          <CalendarOff size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          沒有設計師的時段：{gaps.join("、")}。這些日子客人約不到，正常公休的話忽略即可。
        </div>
      )}

      <div className="rs-scroll">
        <table className="rs-grid">
          <thead>
            <tr>
              <th>設計師</th>
              {WEEKDAYS.map((w) => <th key={w.n}>{w.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {designers.map((d) => {
              const prof = draft.profiles[d.id] || {};
              const photo = resolvePhoto(prof.photo);
              const open = expanded === d.id;
              return (
                <React.Fragment key={d.id}>
                  <tr>
                    <td>
                      <div className="rs-name" onClick={() => setExpanded(open ? "" : d.id)}>
                        {open ? <ChevronDown size={14} color={MUTED} /> : <ChevronRight size={14} color={MUTED} />}
                        {photo
                          ? <img className="rs-thumb" src={photo} alt="" />
                          : <span className="rs-thumb-ph">{(d.name || "?").slice(0, 1)}</span>}
                        <span style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</span>
                        {prof.publicVisible === false && <EyeOff size={12} color={MUTED} />}
                      </div>
                    </td>
                    {WEEKDAYS.map((w) => {
                      const v = (draft.weekly[d.id] || {})[w.n] || "";
                      return (
                        <td key={w.n}>
                          <select
                            className={"rs-sel" + (v ? "" : " rs-sel-off")}
                            value={v}
                            onChange={(e) => setCell(d.id, w.n, e.target.value)}
                          >
                            <option value="">休</option>
                            {STORES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={8} style={{ background: PAPER }}>
                        <div className="rs-panel">
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
                            <label className="field-label">
                              照片檔名
                              <input
                                className="ledger-input" placeholder="staff/paul.jpg"
                                value={prof.photo || ""}
                                onChange={(e) => setProfile(d.id, "photo", e.target.value)}
                              />
                              <span className="field-hint">照片放在專案的 public 資料夾，這裡填相對路徑</span>
                            </label>
                            <label className="field-label">
                              職稱
                              <input
                                className="ledger-input" placeholder="設計師"
                                value={prof.title || ""}
                                onChange={(e) => setProfile(d.id, "title", e.target.value)}
                              />
                            </label>
                          </div>
                          <label className="field-label">
                            介紹（客人在公開頁會看到）
                            <textarea
                              className="ledger-input" rows={2} placeholder="例如：擅長日系柔霧染與短髮設計，喜歡跟客人一起找出適合的樣子。"
                              value={prof.blurb || ""}
                              onChange={(e) => setProfile(d.id, "blurb", e.target.value)}
                            />
                          </label>
                          <label className="field-label">
                            擅長項目（用逗號分隔）
                            <input
                              className="ledger-input" placeholder="剪髮, 染髮, 頭皮護理"
                              value={(prof.specialties || []).join(", ")}
                              onChange={(e) => setProfile(d.id, "specialties",
                                e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean))}
                            />
                          </label>
                          {(services || []).length > 0 && (
                            <div style={{ marginTop: 6, marginBottom: 14 }}>
                              <div style={{ fontSize: 12, color: MUTED, marginBottom: 2 }}>個人價目與時間</div>
                              <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6, marginBottom: 9 }}>
                                留空就沿用共同價目。只填不一樣的項目就好。
                              </div>
                              <div className="rt-table">
                                <div className="rt-row rt-head">
                                  <span>服務</span><span>時間(分)</span><span>價格</span>
                                </div>
                                {services.map((sv) => {
                                  const r = (prof.rates || {})[sv.id] || {};
                                  const dirtyDur = r.durationMin !== undefined && r.durationMin !== "";
                                  const dirtyPrice = r.price !== undefined && r.price !== "";
                                  return (
                                    <div key={sv.id} className="rt-row">
                                      <span style={{ fontSize: 13 }}>
                                        {sv.name}
                                        {(dirtyDur || dirtyPrice) && (
                                          <span style={{ fontSize: 10, color: BRASS, marginLeft: 5 }}>已調整</span>
                                        )}
                                      </span>
                                      <input
                                        type="number" className="ledger-input"
                                        placeholder={String(sv.durationMin)}
                                        value={dirtyDur ? r.durationMin : ""}
                                        onChange={(e) => setRate(d.id, sv.id, "durationMin", e.target.value)}
                                      />
                                      <input
                                        type="number" className="ledger-input"
                                        placeholder={String(sv.price)}
                                        value={dirtyPrice ? r.price : ""}
                                        onChange={(e) => setRate(d.id, sv.id, "price", e.target.value)}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              {Object.keys(prof.rates || {}).length > 0 && (
                                <button className="ledger-btn" style={{ marginTop: 9, fontSize: 12 }}
                                  onClick={() => clearRates(d.id)}>
                                  全部改回共同價目
                                </button>
                              )}
                            </div>
                          )}

                          <button
                            className="ledger-btn"
                            onClick={() => setProfile(d.id, "publicVisible", prof.publicVisible === false)}
                          >
                            {prof.publicVisible === false ? <><EyeOff size={14} /> 公開頁隱藏中，點擊顯示</> : <><Eye size={14} /> 公開頁顯示中，點擊隱藏</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- 單日調整 ---------- */}
      <div className="rs-sec">單日調整</div>
      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.7, marginBottom: 10 }}>
        臨時換店或請假用。只影響選定的那一天，不會動到每週班表。
      </div>
      <div className="rs-panel">
        <label className="field-label" style={{ maxWidth: 200 }}>
          日期
          <input type="date" className="ledger-input" value={ovDate} onChange={(e) => setOvDate(e.target.value)} />
        </label>
        {designers.map((d) => {
          const dayOv = draft.overrides[ovDate] || {};
          const has = Object.prototype.hasOwnProperty.call(dayOv, d.id);
          const defaultStore = (draft.weekly[d.id] || {})[weekdayOfDate(ovDate)] || null;
          return (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, minWidth: 84 }}>{d.name}</span>
              <select
                className="ledger-input" style={{ width: "auto" }}
                value={has ? (dayOv[d.id] || "__off__") : "__default__"}
                onChange={(e) => {
                  const v = e.target.value;
                  setOverride(d.id, v === "__off__" ? null : v);
                }}
              >
                <option value="__default__">
                  照班表（{defaultStore ? storeName(defaultStore) : "休"}）
                </option>
                {STORES.map((st) => <option key={st.id} value={st.id}>改到 {st.name}</option>)}
                <option value="__off__">改成休假</option>
              </select>
              {has && <span style={{ fontSize: 11, color: BRASS }}>已調整</span>}
            </div>
          );
        })}
      </div>

      {/* ---------- 公休日 ---------- */}
      <div className="rs-sec">公休日</div>
      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.7, marginBottom: 10 }}>
        兩家店都不營業的日子，例如過年。客人在公開頁完全看不到這些日期。
      </div>
      <div className="rs-panel">
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap" }}>
          <label className="field-label" style={{ marginBottom: 0, maxWidth: 200 }}>
            新增公休日
            <input type="date" className="ledger-input" value={closedDraft} onChange={(e) => setClosedDraft(e.target.value)} />
          </label>
          <button className="ledger-btn" onClick={addClosed} disabled={!closedDraft}><Plus size={14} /> 加入</button>
        </div>
        <div className="rs-chip-row">
          {draft.closedDates.length === 0
            ? <span style={{ fontSize: 12.5, color: MUTED }}>目前沒有設定公休日。</span>
            : draft.closedDates.map((d) => (
                <span key={d} className="rs-closed">
                  {d}
                  <span className="rs-x" onClick={() => removeClosed(d)}><Trash2 size={12} /></span>
                </span>
              ))}
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
        改完記得按上方的「儲存班表」。存檔後空檔會自動重新發布到公開預約頁。
      </div>
    </div>
  );
}
