import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, X, Search, Calendar, CalendarDays, List, Settings,
  ChevronLeft, ChevronRight, AlertTriangle, Check, Copy, Download,
  ExternalLink, Phone, Save, CircleAlert, Inbox, Users, Store,
} from "lucide-react";
import { STORES, getStore, storeName } from "./stores";
import { RosterEditor, storeOfStaffOn, normalizeRoster, rateOf, totalFor, ROSTER_KEY } from "./roster";
import { BookingInbox } from "./booking-admin";
import { useAutoPublish, SyncIndicator } from "./booking-sync";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

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

const APPT_KEY = "appointments:list";
const SERVICE_KEY = "appointments:services";
const SETTINGS_KEY = "appointments:settings";
const CUSTOMER_KEY = "customers:list";
const STAFF_KEY = "finance:staff";

const SOURCE_OPTIONS = ["電話", "LINE", "現場", "Google", "Instagram", "其他"];

const STATUS = {
  pending: { label: "待確認", bg: BRASS_LIGHT, fg: BRASS, border: BRASS },
  confirmed: { label: "已確認", bg: SAGE_LIGHT, fg: SAGE, border: SAGE },
  arrived: { label: "已到店", bg: "#E4E9F0", fg: "#3D5A80", border: "#3D5A80" },
  done: { label: "已完成", bg: "#EDEAE2", fg: MUTED, border: MUTED },
  noshow: { label: "未到", bg: WINE_LIGHT, fg: WINE, border: WINE },
  cancelled: { label: "已取消", bg: "#EFEDE7", fg: "#A9A29A", border: "#C4BDB2" },
};
const STATUS_ORDER = ["pending", "confirmed", "arrived", "done", "noshow", "cancelled"];
const LIVE_STATUSES = ["pending", "confirmed", "arrived", "done"];

const DEFAULT_SERVICES = [
  { id: "sv-cut", name: "剪髮", durationMin: 60, price: 800 },
  { id: "sv-wash-cut", name: "洗+剪", durationMin: 75, price: 950 },
  { id: "sv-color", name: "染髮", durationMin: 120, price: 2800 },
  { id: "sv-perm", name: "燙髮", durationMin: 150, price: 3200 },
  { id: "sv-treat", name: "護髮", durationMin: 45, price: 1200 },
  { id: "sv-scalp", name: "頭皮護理", durationMin: 60, price: 1500 },
];

const DEFAULT_SETTINGS = {
  openTime: "10:00",
  closeTime: "21:00",
  slotMin: 15,
  reminderTemplate:
    "{{顧客}} 您好，這裡是 LUZ 髮廊 🌿\n提醒您的預約：\n\n📅 {{日期}}（{{星期}}）{{時間}}\n💁 設計師：{{設計師}}\n✂️ 服務：{{服務}}\n\n如需改期請直接回覆這則訊息，謝謝您！",
  salonName: "LUZ 髮廊",
  salonAddress: "",
};

const WEEKDAY_ZH = ["日", "一", "二", "三", "四", "五", "六"];
const PPM = 1.15; // pixels per minute in day view

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}
function fmtMoney(n) {
  return "NT$" + (Math.round(Number(n) || 0)).toLocaleString("zh-TW");
}
function toMin(hhmm) {
  const parts = String(hhmm || "0:00").split(":");
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
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
function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function addMonths(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return fmtDate(d);
}
function weekdayOf(dateStr) {
  return WEEKDAY_ZH[parseDate(dateStr).getDay()];
}
function startOfWeek(dateStr) {
  const d = parseDate(dateStr);
  const shift = (d.getDay() + 6) % 7; // Monday start
  d.setDate(d.getDate() - shift);
  return fmtDate(d);
}
function shortDate(dateStr) {
  const d = parseDate(dateStr);
  return d.getMonth() + 1 + "/" + d.getDate();
}
function sortKey(a) {
  return a.date + "T" + String(Number(a.startMin) || 0).padStart(4, "0");
}
function monthGrid(anchorStr) {
  const a = parseDate(anchorStr);
  const first = new Date(a.getFullYear(), a.getMonth(), 1);
  const startShift = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - startShift);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: fmtDate(d), inMonth: d.getMonth() === a.getMonth() });
  }
  return cells;
}

async function loadKey(key, fallback) {
  try {
    const res = await window.storage.get(key, false);
    if (res && res.value) return JSON.parse(res.value);
    return fallback;
  } catch (e) {
    return fallback;
  }
}
async function saveKey(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), false);
    return true;
  } catch (e) {
    console.error("儲存失敗", key, e);
    return false;
  }
}

function blankAppointment(defaults) {
  return {
    id: uid(),
    date: todayStr(),
    storeId: "",
    startMin: 600,
    durationMin: 60,
    durationEdited: false,
    customerId: "",
    guestName: "",
    guestPhone: "",
    staffId: "",
    services: [],
    price: 0,
    status: "pending",
    source: SOURCE_OPTIONS[0],
    note: "",
    createdAt: new Date().toISOString(),
    ...(defaults || {}),
  };
}

function isDesigner(s) {
  const r = s.role || s.type || "";
  if (!r) return true;
  return /designer|設計/i.test(r);
}

function overlaps(a, b) {
  const as = Number(a.startMin) || 0, ad = Number(a.durationMin) || 0;
  const bs = Number(b.startMin) || 0, bd = Number(b.durationMin) || 0;
  return as < bs + bd && bs < as + ad;
}

function findConflicts(appt, all) {
  if (!appt.staffId) return [];
  return all.filter(
    (o) =>
      o.id !== appt.id &&
      o.date === appt.date &&
      o.staffId === appt.staffId &&
      LIVE_STATUSES.includes(o.status) &&
      overlaps(appt, o)
  );
}

function apptTitle(appt, customerMap) {
  const c = customerMap[appt.customerId];
  if (c) return c.name || "未命名";
  return appt.guestName || "未指定顧客";
}

function serviceSummary(appt) {
  if (!appt.services || appt.services.length === 0) return "未選服務";
  return appt.services.map((s) => s.name).join("、");
}

function gcalUrl(appt, customerMap, staffMap, settings) {
  const d = String(appt.date).replace(/-/g, "");
  const s = toHHMM(appt.startMin).replace(":", "") + "00";
  const e = toHHMM(appt.startMin + appt.durationMin).replace(":", "") + "00";
  const staffName = staffMap[appt.staffId] ? staffMap[appt.staffId].name : "未指定";
  const title = apptTitle(appt, customerMap) + " / " + serviceSummary(appt);
  const details = [
    "設計師：" + staffName,
    "服務：" + serviceSummary(appt),
    "預估金額：" + fmtMoney(appt.price),
    appt.note ? "備註：" + appt.note : "",
  ]
    .filter(Boolean)
    .join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: d + "T" + s + "/" + d + "T" + e,
    details: details,
    ctz: "Asia/Taipei",
  });
  if (settings.salonAddress) params.set("location", settings.salonAddress);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

function buildIcs(appts, customerMap, staffMap, settings) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (() => {
    const n = new Date();
    return (
      n.getUTCFullYear() + pad(n.getUTCMonth() + 1) + pad(n.getUTCDate()) + "T" +
      pad(n.getUTCHours()) + pad(n.getUTCMinutes()) + pad(n.getUTCSeconds()) + "Z"
    );
  })();
  const esc = (t) => String(t || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LUZ//Salon Appointments//ZH",
    "CALSCALE:GREGORIAN",
  ];
  appts.forEach((a) => {
    const d = String(a.date).replace(/-/g, "");
    const st = toHHMM(a.startMin).replace(":", "") + "00";
    const en = toHHMM(a.startMin + a.durationMin).replace(":", "") + "00";
    const staffName = staffMap[a.staffId] ? staffMap[a.staffId].name : "未指定";
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + a.id + "@luz-salon",
      "DTSTAMP:" + stamp,
      "DTSTART;TZID=Asia/Taipei:" + d + "T" + st,
      "DTEND;TZID=Asia/Taipei:" + d + "T" + en,
      "SUMMARY:" + esc(apptTitle(a, customerMap) + " / " + serviceSummary(a)),
      "DESCRIPTION:" + esc("設計師：" + staffName + "\n服務：" + serviceSummary(a) + (a.note ? "\n備註：" + a.note : "")),
      settings.salonAddress ? "LOCATION:" + esc(settings.salonAddress) : "",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reminderText(appt, customerMap, staffMap, settings) {
  const c = customerMap[appt.customerId];
  const staffName = staffMap[appt.staffId] ? staffMap[appt.staffId].name : "未指定";
  return String(settings.reminderTemplate || "")
    .replace(/\{\{顧客\}\}/g, c ? c.name : appt.guestName || "您")
    .replace(/\{\{日期\}\}/g, appt.date)
    .replace(/\{\{星期\}\}/g, weekdayOf(appt.date))
    .replace(/\{\{時間\}\}/g, toHHMM(appt.startMin) + "–" + toHHMM(appt.startMin + appt.durationMin))
    .replace(/\{\{設計師\}\}/g, staffName)
    .replace(/\{\{服務\}\}/g, serviceSummary(appt))
    .replace(/\{\{店名\}\}/g, settings.salonName || "");
}

/* ---------- small shared pieces ---------- */

function Field({ label, children, hint }) {
  return (
    <label className="field-label">
      {label}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function ConfirmDelete({ onConfirm, label }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed) {
    return (
      <button type="button" onClick={() => { setArmed(false); onConfirm(); }} className="ledger-btn ledger-btn-danger" style={{ fontSize: 12 }}>
        確定{label || "刪除"}
      </button>
    );
  }
  return (
    <button type="button" onClick={() => setArmed(true)} className="ledger-icon-btn" title={label || "刪除"}>
      <Trash2 size={15} />
    </button>
  );
}

function StatusPill({ status, small }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span className="status-pill" style={{ background: s.bg, color: s.fg, fontSize: small ? 10 : 11 }}>
      {s.label}
    </span>
  );
}

function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* nothing more to try */ }
      document.body.removeChild(ta);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button type="button" className="ledger-btn" onClick={copy}>
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? "已複製" : label}
    </button>
  );
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: wide ? 760 : 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600 }}>{title}</div>
          <button type="button" className="ledger-icon-btn" onClick={onClose} title="關閉"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* ---------- appointment form ---------- */

function AppointmentForm({ appt, isNew, customers, staff, services, settings, roster, allAppts, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(appt);
  const [custSearch, setCustSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const customerMap = useMemo(() => {
    const m = {};
    customers.forEach((c) => { m[c.id] = c; });
    return m;
  }, [customers]);
  const staffMap = useMemo(() => {
    const m = {};
    staff.forEach((s) => { m[s.id] = s; });
    return m;
  }, [staff]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleService(sv) {
    setForm((f) => {
      const has = f.services.some((x) => x.id === sv.id);
      const r = rateOf(normalizeRoster(roster), f.staffId, sv);
      const next = has
        ? f.services.filter((x) => x.id !== sv.id)
        : [...f.services, { id: sv.id, name: sv.name, durationMin: r.durationMin, price: r.price }];
      const sumDur = next.reduce((t, x) => t + (x.durationMin || 0), 0);
      const sumPrice = next.reduce((t, x) => t + (x.price || 0), 0);
      return {
        ...f,
        services: next,
        durationMin: f.durationEdited ? f.durationMin : (sumDur || f.durationMin),
        price: sumPrice,
      };
    });
  }

  /** 換設計師時，已選的服務要換成他的價目 */
  function applyStaffRates(f, sid) {
    if (!f.services || f.services.length === 0) return f;
    const r = normalizeRoster(roster);
    const next = f.services.map((x) => {
      const sv = (services || []).find((y) => y.id === x.id);
      if (!sv) return x;
      const rr = rateOf(r, sid, sv);
      return { ...x, durationMin: rr.durationMin, price: rr.price };
    });
    return {
      ...f,
      services: next,
      durationMin: f.durationEdited ? f.durationMin : next.reduce((t, x) => t + (x.durationMin || 0), 0),
      price: next.reduce((t, x) => t + (x.price || 0), 0),
    };
  }

  const customer = customerMap[form.customerId];
  const rosterStore = useMemo(
    () => storeOfStaffOn(normalizeRoster(roster), form.staffId, form.date),
    [roster, form.staffId, form.date]
  );
  const conflicts = useMemo(() => findConflicts(form, allAppts), [form, allAppts]);
  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    const list = customers.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-TW"));
    if (!q) return list.slice(0, 30);
    return list.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.nickname || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q)
    ).slice(0, 30);
  }, [customers, custSearch]);

  const futureOfCustomer = useMemo(() => {
    if (!form.customerId) return [];
    const t = todayStr();
    return allAppts
      .filter((a) => a.customerId === form.customerId && a.id !== form.id && a.date >= t && LIVE_STATUSES.includes(a.status))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  }, [allAppts, form.customerId, form.id]);

  function pickCustomer(c) {
    setForm((f) => ({
      ...f,
      customerId: c.id,
      guestName: "",
      guestPhone: "",
      staffId: f.staffId || c.preferredStylistId || "",
    }));
    setShowPicker(false);
    setCustSearch("");
  }

  function submit() {
    if (!form.staffId) return;
    onSave({
      ...form,
      durationMin: Math.max(15, parseInt(form.durationMin, 10) || 60),
      price: parseFloat(form.price) || 0,
    });
  }

  const endMin = form.startMin + (parseInt(form.durationMin, 10) || 0);
  const designers = staff.filter(isDesigner);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {customer && customer.allergies && (
        <div className="alert-band alert-wine">
          <AlertTriangle size={15} /> 過敏 / 注意事項：{customer.allergies}
        </div>
      )}
      {customer && (customer.noShowCount || 0) >= 2 && (
        <div className="alert-band alert-brass">
          <CircleAlert size={15} /> 這位顧客有 {customer.noShowCount} 次未到記錄，建議前一天再確認一次。
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="alert-band alert-wine">
          <AlertTriangle size={15} />
          時段衝突：{staffMap[form.staffId] ? staffMap[form.staffId].name : ""} 在 {conflicts.map((c) => toHHMM(c.startMin) + "–" + toHHMM(c.startMin + c.durationMin)).join("、")} 已有預約。
        </div>
      )}

      <div>
        <div className="field-label" style={{ marginBottom: 6 }}>顧客</div>
        {customer ? (
          <div className="picked-row">
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div className="avatar">{(customer.name || "?").slice(0, 1)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{customer.name}{customer.nickname ? "（" + customer.nickname + "）" : ""}</div>
                <div style={{ fontSize: 12, color: MUTED }}>
                  {customer.phone && <span><Phone size={10} style={{ verticalAlign: -1 }} /> {customer.phone}　</span>}
                  到店 {customer.visitCount || 0} 次
                </div>
              </div>
            </div>
            <button type="button" className="ledger-btn" onClick={() => set("customerId", "")}>換人</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button type="button" className="ledger-btn" onClick={() => setShowPicker((v) => !v)}>
                <Search size={14} /> 從顧客資料選擇
              </button>
            </div>
            {showPicker && (
              <div className="picker-box">
                <input className="ledger-input" placeholder="搜尋姓名、暱稱或電話" value={custSearch} onChange={(e) => setCustSearch(e.target.value)} autoFocus />
                <div className="picker-list">
                  {filteredCustomers.length === 0 ? (
                    <div style={{ padding: 14, color: MUTED, fontSize: 13, textAlign: "center" }}>顧客資料裡找不到，先用下面的臨時顧客欄位登記。</div>
                  ) : filteredCustomers.map((c) => (
                    <div key={c.id} className="picker-item" onClick={() => pickCustomer(c)}>
                      <span>{c.name}{c.nickname ? "（" + c.nickname + "）" : ""}</span>
                      <span style={{ color: MUTED, fontSize: 12 }}>{c.phone}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="form-grid-2">
              <Field label="臨時顧客姓名" hint="新客或不建檔的客人填這裡">
                <input className="ledger-input" value={form.guestName} onChange={(e) => set("guestName", e.target.value)} />
              </Field>
              <Field label="臨時顧客電話">
                <input className="ledger-input" value={form.guestPhone} onChange={(e) => set("guestPhone", e.target.value)} />
              </Field>
            </div>
          </>
        )}
      </div>

      {futureOfCustomer.length > 0 && (
        <div className="soft-box">
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>這位顧客的其他未來預約</div>
          {futureOfCustomer.map((a) => (
            <div key={a.id} style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace" }}>
              {a.date}（{weekdayOf(a.date)}）{toHHMM(a.startMin)}　{serviceSummary(a)}
            </div>
          ))}
        </div>
      )}

      <div className="form-grid-2">
        <Field label="日期">
          <input type="date" className="ledger-input" value={form.date}
            onChange={(e) => {
              const d = e.target.value;
              const auto = storeOfStaffOn(normalizeRoster(roster), form.staffId, d);
              setForm((f) => ({ ...f, date: d, storeId: auto || f.storeId }));
            }} />
        </Field>
        <Field label="設計師">
          <select className="ledger-input" value={form.staffId}
            onChange={(e) => {
              const sid = e.target.value;
              const auto = storeOfStaffOn(normalizeRoster(roster), sid, form.date);
              setForm((f) => applyStaffRates({ ...f, staffId: sid, storeId: auto || f.storeId }, sid));
            }}>
            <option value="">— 請選擇 —</option>
            {designers.map((s) => {
              const at = storeOfStaffOn(normalizeRoster(roster), s.id, form.date);
              return <option key={s.id} value={s.id}>{s.name}{at ? "（" + storeName(at) + "）" : "（當天休假）"}</option>;
            })}
          </select>
        </Field>
        <Field label="分店" hint={rosterStore && rosterStore !== form.storeId ? "班表上這位設計師當天在 " + storeName(rosterStore) : ""}>
          <select className="ledger-input" value={form.storeId} onChange={(e) => set("storeId", e.target.value)}>
            <option value="">— 請選擇 —</option>
            {STORES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </Field>
        <Field label="開始時間">
          <input type="time" step={300} className="ledger-input" value={toHHMM(form.startMin)} onChange={(e) => set("startMin", toMin(e.target.value))} />
        </Field>
        <Field label={"時長（分鐘）　結束 " + toHHMM(endMin)}>
          <input type="number" min={15} step={5} className="ledger-input" value={form.durationMin}
            onChange={(e) => setForm((f) => ({ ...f, durationMin: e.target.value, durationEdited: true }))} />
        </Field>
      </div>

      <div>
        <div className="field-label" style={{ marginBottom: 6 }}>服務項目</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {services.length === 0 ? (
            <div style={{ fontSize: 13, color: MUTED }}>還沒有服務項目，先到右上角「服務與設定」建立。</div>
          ) : services.map((sv) => {
            const on = form.services.some((x) => x.id === sv.id);
            return (
              <button key={sv.id} type="button" className={"chip" + (on ? " chip-on" : "")} onClick={() => toggleService(sv)}>
                {on ? "✓ " : ""}{sv.name}{" "}
                <span style={{ opacity: 0.7 }}>
                  {rateOf(normalizeRoster(roster), form.staffId, sv).durationMin}分
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-grid-2">
        <Field label="預估金額 (NT$)">
          <input type="number" className="ledger-input" value={form.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
        <Field label="預約來源">
          <select className="ledger-input" value={form.source} onChange={(e) => set("source", e.target.value)}>
            {SOURCE_OPTIONS.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
      </div>

      <Field label="備註">
        <textarea className="ledger-input" rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="例如：想帶圖來討論、上次染色偏紅" />
      </Field>

      <div>
        <div className="field-label" style={{ marginBottom: 6 }}>狀態</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {STATUS_ORDER.map((k) => (
            <button key={k} type="button" className={"chip" + (form.status === k ? " chip-on" : "")} onClick={() => set("status", k)}>
              {STATUS[k].label}
            </button>
          ))}
        </div>
        {form.status === "done" && <div className="field-hint" style={{ marginTop: 6 }}>存檔時會自動更新顧客的到店次數、累積消費與上次到店日期。</div>}
        {form.status === "noshow" && <div className="field-hint" style={{ marginTop: 6 }}>存檔時會自動把顧客的未到次數 +1。</div>}
      </div>

      {!isNew && (
        <div className="soft-box">
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>行事曆與通知</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <a className="ledger-btn" href={gcalUrl(form, customerMap, staffMap, settings)} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> 加入 Google 日曆
            </a>
            <button type="button" className="ledger-btn" onClick={() => downloadIcs("appointment-" + form.date + ".ics", buildIcs([form], customerMap, staffMap, settings))}>
              <Download size={14} /> 下載 .ics
            </button>
            <CopyButton text={reminderText(form, customerMap, staffMap, settings)} label="複製 LINE 提醒文字" />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderTop: "1px solid " + PAPER_LINE, paddingTop: 12 }}>
        <div>{!isNew && <ConfirmDelete onConfirm={() => onDelete(form.id)} label="刪除預約" />}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="ledger-btn" onClick={onClose}>取消</button>
          <button type="button" className="ledger-btn ledger-btn-primary" onClick={submit} disabled={!form.staffId}>
            <Save size={14} /> {isNew ? "建立預約" : "儲存變更"}
          </button>
        </div>
      </div>
      {!form.staffId && <div className="field-hint" style={{ textAlign: "right" }}>請先選擇設計師才能存檔。</div>}
    </div>
  );
}

/* ---------- services & settings ---------- */

function ServiceSettings({ services, settings, onSaveServices, onSaveSettings }) {
  const [list, setList] = useState(services);
  const [cfg, setCfg] = useState(settings);
  const [draft, setDraft] = useState({ name: "", durationMin: 60, price: 0 });

  function addService() {
    if (!draft.name.trim()) return;
    const next = [...list, { id: uid(), name: draft.name.trim(), durationMin: parseInt(draft.durationMin, 10) || 60, price: parseFloat(draft.price) || 0 }];
    setList(next);
    onSaveServices(next);
    setDraft({ name: "", durationMin: 60, price: 0 });
  }
  function updateService(id, key, value) {
    const next = list.map((s) => (s.id === id ? { ...s, [key]: key === "name" ? value : (parseFloat(value) || 0) } : s));
    setList(next);
    onSaveServices(next);
  }
  function removeService(id) {
    const next = list.filter((s) => s.id !== id);
    setList(next);
    onSaveServices(next);
  }
  function setCfgKey(key, value) {
    const next = { ...cfg, [key]: value };
    setCfg(next);
    onSaveSettings(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div className="sub-head">服務項目</div>
        <div className="sv-table">
          <div className="sv-row sv-head">
            <span>名稱</span><span>時長(分)</span><span>價格</span><span />
          </div>
          {list.map((s) => (
            <div key={s.id} className="sv-row">
              <input className="ledger-input" value={s.name} onChange={(e) => updateService(s.id, "name", e.target.value)} />
              <input type="number" className="ledger-input" value={s.durationMin} onChange={(e) => updateService(s.id, "durationMin", e.target.value)} />
              <input type="number" className="ledger-input" value={s.price} onChange={(e) => updateService(s.id, "price", e.target.value)} />
              <ConfirmDelete onConfirm={() => removeService(s.id)} label="刪除項目" />
            </div>
          ))}
          <div className="sv-row">
            <input className="ledger-input" placeholder="新服務名稱" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input type="number" className="ledger-input" value={draft.durationMin} onChange={(e) => setDraft({ ...draft, durationMin: e.target.value })} />
            <input type="number" className="ledger-input" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            <button type="button" className="ledger-icon-btn" onClick={addService} title="新增服務"><Plus size={16} /></button>
          </div>
        </div>
        <div className="field-hint">選了服務會自動帶入時長與金額，之後在預約表單裡還能手動微調。</div>
      </div>

      <div>
        <div className="sub-head">營業時間</div>
        <div className="form-grid-2">
          <Field label="開店"><input type="time" className="ledger-input" value={cfg.openTime} onChange={(e) => setCfgKey("openTime", e.target.value)} /></Field>
          <Field label="打烊"><input type="time" className="ledger-input" value={cfg.closeTime} onChange={(e) => setCfgKey("closeTime", e.target.value)} /></Field>
          <Field label="時間刻度（分鐘）">
            <select className="ledger-input" value={cfg.slotMin} onChange={(e) => setCfgKey("slotMin", parseInt(e.target.value, 10))}>
              {[10, 15, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div>
        <div className="sub-head">店家資訊與提醒範本</div>
        <div className="form-grid-2">
          <Field label="店名"><input className="ledger-input" value={cfg.salonName} onChange={(e) => setCfgKey("salonName", e.target.value)} /></Field>
          <Field label="地址（會寫進日曆事件）"><input className="ledger-input" value={cfg.salonAddress} onChange={(e) => setCfgKey("salonAddress", e.target.value)} /></Field>
        </div>
        <Field label="LINE 提醒訊息範本" hint="可用的變數：{{顧客}} {{日期}} {{星期}} {{時間}} {{設計師}} {{服務}} {{店名}}">
          <textarea className="ledger-input" rows={7} value={cfg.reminderTemplate} onChange={(e) => setCfgKey("reminderTemplate", e.target.value)} />
        </Field>
      </div>
    </div>
  );
}

/* ---------- day view ---------- */

function DayView({ date, appts, designers, customerMap, settings, roster, onOpen, onCreateAt }) {
  const openMin = toMin(settings.openTime);
  const closeMin = toMin(settings.closeTime);
  const span = Math.max(60, closeMin - openMin);
  const height = span * PPM;
  const slot = settings.slotMin || 15;
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });

  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const hourMarks = [];
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) hourMarks.push(m);

  const isToday = date === todayStr();
  const showNow = isToday && nowMin >= openMin && nowMin <= closeMin;

  function columnClick(e, staffId) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const raw = openMin + y / PPM;
    const snapped = Math.round(raw / slot) * slot;
    onCreateAt(date, Math.min(Math.max(snapped, openMin), closeMin - slot), staffId);
  }

  if (designers.length === 0) {
    return (
      <div className="empty-state">
        還沒有設計師名單。先到財務模組的員工頁面建立設計師，這裡的欄位就會自動出現。
      </div>
    );
  }

  return (
    <div className="day-scroll">
      <div className="day-grid" style={{ gridTemplateColumns: "56px repeat(" + designers.length + ", minmax(150px, 1fr))" }}>
        <div className="day-corner" />
        {designers.map((s) => {
          const count = appts.filter((a) => a.staffId === s.id && LIVE_STATUSES.includes(a.status)).length;
          const at = storeOfStaffOn(normalizeRoster(roster), s.id, date);
          return (
            <div key={s.id} className="day-colhead">
              <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: at ? BRASS : MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>
                {at ? storeName(at) : "休"} · {count} 筆
              </div>
            </div>
          );
        })}

        <div className="time-gutter" style={{ height }}>
          {hourMarks.map((m) => (
            <div key={m} className="time-mark" style={{ top: (m - openMin) * PPM }}>{toHHMM(m)}</div>
          ))}
        </div>

        {designers.map((s) => (
          <div
            key={s.id}
            className="day-col"
            style={{
              height,
              backgroundImage:
                "repeating-linear-gradient(to bottom, " + PAPER_LINE + " 0 1px, transparent 1px " + 60 * PPM + "px)",
            }}
            onClick={(e) => columnClick(e, s.id)}
            title="點空白處新增預約"
          >
            {showNow && (
              <div className="now-line" style={{ top: (nowMin - openMin) * PPM }}>
                <span />
              </div>
            )}
            {appts.filter((a) => a.staffId === s.id).map((a) => {
              const st = STATUS[a.status] || STATUS.pending;
              const top = (a.startMin - openMin) * PPM;
              const h = Math.max(a.durationMin * PPM, 30);
              const cust = customerMap[a.customerId];
              return (
                <div
                  key={a.id}
                  className="appt-block"
                  style={{
                    top, height: h - 3, background: st.bg, borderLeft: "3px solid " + st.border, color: st.fg,
                    opacity: a.status === "cancelled" ? 0.55 : 1,
                    textDecoration: a.status === "cancelled" ? "line-through" : "none",
                  }}
                  onClick={() => onOpen(a)}
                >
                  <div className="appt-time">{toHHMM(a.startMin)}–{toHHMM(a.startMin + a.durationMin)}</div>
                  <div className="appt-name">
                    {apptTitle(a, customerMap)}
                    {cust && cust.allergies ? <AlertTriangle size={11} style={{ marginLeft: 4, verticalAlign: -1 }} /> : null}
                  </div>
                  {h > 52 && <div className="appt-sv">{serviceSummary(a)}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- week view ---------- */

function WeekView({ anchor, appts, designers, customerMap, staffMap, staffFilter, onOpen, onJumpDay }) {
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = todayStr();

  return (
    <div className="week-grid">
      {days.map((d) => {
        const list = appts
          .filter((a) => a.date === d && (!staffFilter || a.staffId === staffFilter))
          .sort((a, b) => a.startMin - b.startMin);
        const live = list.filter((a) => LIVE_STATUSES.includes(a.status));
        const revenue = live.reduce((t, a) => t + (a.price || 0), 0);
        return (
          <div key={d} className={"week-col" + (d === today ? " week-col-today" : "")}>
            <div className="week-colhead" onClick={() => onJumpDay(d)} title="切到單日檢視">
              <span style={{ fontWeight: 600 }}>{shortDate(d)}</span>
              <span style={{ color: MUTED }}>（{weekdayOf(d)}）</span>
              <span className="week-count">{live.length}</span>
            </div>
            <div className="week-body">
              {list.length === 0 ? (
                <div className="week-empty">—</div>
              ) : list.map((a) => {
                const st = STATUS[a.status] || STATUS.pending;
                return (
                  <div key={a.id} className="week-chip" style={{ background: st.bg, color: st.fg, borderLeft: "3px solid " + st.border, opacity: a.status === "cancelled" ? 0.55 : 1 }} onClick={() => onOpen(a)}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>{toHHMM(a.startMin)}</div>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {apptTitle(a, customerMap)}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {staffMap[a.staffId] ? staffMap[a.staffId].name : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            {revenue > 0 && <div className="week-foot">{fmtMoney(revenue)}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- month view ---------- */

function MonthView({ anchor, appts, customerMap, staffFilter, onJumpDay }) {
  const cells = monthGrid(anchor);
  const today = todayStr();
  const byDate = useMemo(() => {
    const m = {};
    appts.forEach((a) => {
      if (!LIVE_STATUSES.includes(a.status)) return;
      if (staffFilter && a.staffId !== staffFilter) return;
      if (!m[a.date]) m[a.date] = [];
      m[a.date].push(a);
    });
    Object.keys(m).forEach((k) => m[k].sort((a, b) => a.startMin - b.startMin));
    return m;
  }, [appts, staffFilter]);

  return (
    <div>
      <div className="month-head">
        {WEEKDAY_ZH.slice(1).concat(WEEKDAY_ZH.slice(0, 1)).map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="month-grid">
        {cells.map((c) => {
          const list = byDate[c.date] || [];
          return (
            <div
              key={c.date}
              className={"month-cell" + (c.inMonth ? "" : " month-cell-out") + (c.date === today ? " month-cell-today" : "")}
              onClick={() => onJumpDay(c.date)}
            >
              <div className="month-daynum">
                {parseDate(c.date).getDate()}
                {list.length > 0 && <span className="month-badge">{list.length}</span>}
              </div>
              {list.slice(0, 3).map((a) => {
                const st = STATUS[a.status] || STATUS.pending;
                return (
                  <div key={a.id} className="month-chip" style={{ background: st.bg, color: st.fg }}>
                    {toHHMM(a.startMin)} {apptTitle(a, customerMap)}
                  </div>
                );
              })}
              {list.length > 3 && <div className="month-more">還有 {list.length - 3} 筆</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- list view ---------- */

function ListView({ appts, customerMap, staffMap, onOpen }) {
  const [q, setQ] = useState("");
  const [range, setRange] = useState("future");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    const t = todayStr();
    const query = q.trim().toLowerCase();
    return appts
      .filter((a) => (range === "future" ? a.date >= t : range === "past" ? a.date < t : true))
      .filter((a) => (!statusFilter || a.status === statusFilter))
      .filter((a) => {
        if (!query) return true;
        const c = customerMap[a.customerId];
        const st = staffMap[a.staffId];
        return (
          (c ? (c.name || "") + (c.nickname || "") + (c.phone || "") : "").toLowerCase().includes(query) ||
          (a.guestName || "").toLowerCase().includes(query) ||
          (a.guestPhone || "").includes(query) ||
          (st ? st.name : "").toLowerCase().includes(query) ||
          serviceSummary(a).toLowerCase().includes(query)
        );
      })
      .sort((a, b) => (range === "past" ? -1 : 1) * sortKey(a).localeCompare(sortKey(b)));
  }, [appts, q, range, statusFilter, customerMap, staffMap]);

  const grouped = useMemo(() => {
    const out = [];
    filtered.forEach((a) => {
      const last = out[out.length - 1];
      if (last && last.date === a.date) last.items.push(a);
      else out.push({ date: a.date, items: [a] });
    });
    return out;
  }, [filtered]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: MUTED }} />
          <input className="ledger-input" style={{ paddingLeft: 30 }} placeholder="搜尋顧客、設計師或服務" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {[["future", "今天起"], ["past", "過去"], ["all", "全部"]].map(([k, label]) => (
          <button key={k} className={"chip" + (range === k ? " chip-on" : "")} onClick={() => setRange(k)}>{label}</button>
        ))}
        <select className="ledger-input" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">所有狀態</option>
          {STATUS_ORDER.map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}
        </select>
      </div>

      {grouped.length === 0 ? (
        <div className="empty-state">沒有符合條件的預約。</div>
      ) : grouped.map((g) => (
        <div key={g.date} style={{ marginBottom: 14 }}>
          <div className="list-datehead">{g.date}（{weekdayOf(g.date)}）<span style={{ color: MUTED, fontWeight: 400 }}>{g.items.length} 筆</span></div>
          {g.items.map((a) => {
            const c = customerMap[a.customerId];
            return (
              <div key={a.id} className="list-row" onClick={() => onOpen(a)}>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, width: 96, flexShrink: 0 }}>
                  {toHHMM(a.startMin)}–{toHHMM(a.startMin + a.durationMin)}
                </div>
                <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                    {apptTitle(a, customerMap)}
                    {c && c.allergies ? <AlertTriangle size={12} color={WINE} /> : null}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED }}>{serviceSummary(a)}</div>
                </div>
                <div style={{ fontSize: 13, width: 88, flexShrink: 0, color: MUTED }}>
                  {staffMap[a.staffId] ? staffMap[a.staffId].name : "—"}
                </div>
                <div style={{ fontSize: 13, width: 84, flexShrink: 0, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>
                  {fmtMoney(a.price)}
                </div>
                <div style={{ width: 62, flexShrink: 0, textAlign: "right" }}><StatusPill status={a.status} small /></div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ---------- main ---------- */

export default function SalonAppointmentApp() {
  const [loaded, setLoaded] = useState(false);
  const [appts, setAppts] = useState([]);
  const [services, setServices] = useState(DEFAULT_SERVICES);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [roster, setRoster] = useState(normalizeRoster(null));

  const [view, setView] = useState("day");
  const [anchor, setAnchor] = useState(todayStr());
  const [staffFilter, setStaffFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [sync, setSync] = useState({ status: "idle", message: "" });

  useEffect(() => {
    (async () => {
      const [a, sv, cfg, cs, st, ro] = await Promise.all([
        loadKey(APPT_KEY, []),
        loadKey(SERVICE_KEY, null),
        loadKey(SETTINGS_KEY, null),
        loadKey(CUSTOMER_KEY, []),
        loadKey(STAFF_KEY, []),
        loadKey(ROSTER_KEY, null),
      ]);
      setAppts(a);
      if (sv) setServices(sv);
      if (cfg) setSettings({ ...DEFAULT_SETTINGS, ...cfg });
      setCustomers(cs);
      setStaff(st);
      setRoster(normalizeRoster(ro));
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveKey(APPT_KEY, appts); }, [appts, loaded]);

  const customerMap = useMemo(() => {
    const m = {};
    customers.forEach((c) => { m[c.id] = c; });
    return m;
  }, [customers]);
  const staffMap = useMemo(() => {
    const m = {};
    staff.forEach((s) => { m[s.id] = s; });
    return m;
  }, [staff]);
  const designers = useMemo(() => {
    let d = staff.filter(isDesigner);
    if (staffFilter) d = d.filter((s) => s.id === staffFilter);
    if (storeFilter) {
      d = d.filter((s) => storeOfStaffOn(normalizeRoster(roster), s.id, anchor) === storeFilter);
    }
    return d;
  }, [staff, staffFilter, storeFilter, roster, anchor]);
  const allDesigners = useMemo(() => staff.filter(isDesigner), [staff]);

  const autoPublish = useAutoPublish({
    ready: loaded,
    appointments: appts,
    staff, services, settings, roster,
    onStatus: setSync,
  });

  // 店別篩選：只影響畫面，不影響撞單判斷（時間軸永遠是全部）
  const visibleAppts = useMemo(
    () => (storeFilter ? appts.filter((a) => a.storeId === storeFilter) : appts),
    [appts, storeFilter]
  );
  const dayAppts = useMemo(() => visibleAppts.filter((a) => a.date === anchor), [visibleAppts, anchor]);

  const todaySummary = useMemo(() => {
    const list = appts.filter((a) => a.date === todayStr() && LIVE_STATUSES.includes(a.status));
    return {
      count: list.length,
      revenue: list.reduce((t, a) => t + (a.price || 0), 0),
      pending: appts.filter((a) => a.date >= todayStr() && a.status === "pending").length,
    };
  }, [appts]);

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  function openNew(defaults) {
    setEditing(blankAppointment({ date: anchor, startMin: toMin(settings.openTime), ...(defaults || {}) }));
    setEditingIsNew(true);
  }
  function openExisting(a) {
    setEditing(a);
    setEditingIsNew(false);
  }

  function applyCustomerSideEffects(saved, previous) {
    if (!saved.customerId) return;
    const wasDone = previous && previous.status === "done";
    const wasNoshow = previous && previous.status === "noshow";
    if (saved.status === "done" && !wasDone) {
      const next = customers.map((c) => {
        if (c.id !== saved.customerId) return c;
        return {
          ...c,
          visitCount: (parseInt(c.visitCount, 10) || 0) + 1,
          totalSpend: (parseFloat(c.totalSpend) || 0) + (parseFloat(saved.price) || 0),
          lastVisitDate: saved.date > (c.lastVisitDate || "") ? saved.date : c.lastVisitDate,
        };
      });
      setCustomers(next);
      saveKey(CUSTOMER_KEY, next);
      flash("已更新顧客到店紀錄與累積消費");
    } else if (saved.status === "noshow" && !wasNoshow) {
      const next = customers.map((c) => (c.id === saved.customerId ? { ...c, noShowCount: (parseInt(c.noShowCount, 10) || 0) + 1 } : c));
      setCustomers(next);
      saveKey(CUSTOMER_KEY, next);
      flash("已把顧客的未到次數 +1");
    }
  }

  function saveAppt(form) {
    const previous = appts.find((a) => a.id === form.id) || null;
    setAppts((prev) => {
      const exists = prev.some((a) => a.id === form.id);
      return exists ? prev.map((a) => (a.id === form.id ? form : a)) : [...prev, form];
    });
    applyCustomerSideEffects(form, previous);
    setAnchor(form.date);
    setEditing(null);
    setEditingIsNew(false);
  }
  function deleteAppt(id) {
    setAppts((prev) => prev.filter((a) => a.id !== id));
    setEditing(null);
  }

  function step(dir) {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else if (view === "month") setAnchor(addMonths(anchor, dir));
  }

  function periodLabel() {
    if (view === "day") return anchor + "（" + weekdayOf(anchor) + "）";
    if (view === "week") {
      const s = startOfWeek(anchor);
      return shortDate(s) + " – " + shortDate(addDays(s, 6));
    }
    if (view === "month") {
      const d = parseDate(anchor);
      return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月";
    }
    return "全部預約";
  }

  function exportRange() {
    let list = [];
    let name = "luz-appointments.ics";
    if (view === "day") { list = dayAppts; name = "luz-" + anchor + ".ics"; }
    else if (view === "week") {
      const s = startOfWeek(anchor);
      const e = addDays(s, 6);
      list = appts.filter((a) => a.date >= s && a.date <= e);
      name = "luz-week-" + s + ".ics";
    } else {
      const t = todayStr();
      list = appts.filter((a) => a.date >= t);
      name = "luz-upcoming.ics";
    }
    list = list.filter((a) => LIVE_STATUSES.includes(a.status));
    if (list.length === 0) { flash("這個範圍沒有可匯出的預約"); return; }
    downloadIcs(name, buildIcs(list, customerMap, staffMap, settings));
  }

  if (!loaded) {
    return <div style={{ padding: 60, textAlign: "center", color: MUTED, fontFamily: "'IBM Plex Sans', sans-serif" }}>預約資料載入中…</div>;
  }

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PAPER, color: INK, minHeight: "100vh", paddingBottom: 60 }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        .field-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${MUTED}; margin-bottom: 10px; }
        .field-hint { font-size: 11px; color: ${MUTED}; line-height: 1.5; }
        .sub-head { font-family: 'Fraunces', serif; font-size: 15px; font-weight: 600; color: ${INK}; margin-bottom: 10px; }
        .ledger-input {
          font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; color: ${INK};
          background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 6px;
          padding: 8px 10px; outline: none; width: 100%; resize: vertical;
        }
        .ledger-input:focus { border-color: ${BRASS}; box-shadow: 0 0 0 2px rgba(169,129,47,0.15); }
        .ledger-btn {
          display: inline-flex; align-items: center; gap: 6px; font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px; font-weight: 500; color: ${INK}; background: #FFFDF8; text-decoration: none;
          border: 1px solid ${PAPER_LINE}; border-radius: 6px; padding: 8px 14px; cursor: pointer; white-space: nowrap;
        }
        .ledger-btn:hover { border-color: ${BRASS}; }
        .ledger-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ledger-btn-primary { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .ledger-btn-primary:hover:not(:disabled) { background: #3A322A; }
        .ledger-btn-danger { background: ${WINE}; color: white; border-color: ${WINE}; }
        .ledger-icon-btn {
          display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
          border-radius: 6px; border: 1px solid transparent; background: transparent; color: ${MUTED}; cursor: pointer; flex-shrink: 0;
        }
        .ledger-icon-btn:hover { background: ${PAPER}; color: ${INK}; }
        .chip {
          font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; padding: 6px 11px; border-radius: 999px;
          border: 1px solid ${PAPER_LINE}; background: #FFFDF8; color: ${MUTED}; cursor: pointer; white-space: nowrap;
        }
        .chip-on { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .status-pill { display: inline-flex; align-items: center; padding: 3px 8px; border-radius: 999px; font-weight: 600; white-space: nowrap; }
        .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
        .avatar {
          width: 34px; height: 34px; border-radius: 50%; background: ${SAGE_LIGHT}; color: ${SAGE};
          display: flex; align-items: center; justify-content: center; font-family: 'Fraunces', serif;
          font-weight: 600; font-size: 14px; flex-shrink: 0;
        }
        .alert-band { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; line-height: 1.5; }
        .alert-wine { background: ${WINE_LIGHT}; color: ${WINE}; }
        .alert-brass { background: ${BRASS_LIGHT}; color: ${BRASS}; }
        .soft-box { background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 8px; padding: 12px; }
        .picked-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 8px; padding: 10px 12px; }
        .picker-box { border: 1px solid ${PAPER_LINE}; border-radius: 8px; padding: 8px; background: #FFFDF8; margin-bottom: 10px; }
        .picker-list { max-height: 200px; overflow-y: auto; margin-top: 6px; }
        .picker-item { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .picker-item:hover { background: ${BRASS_LIGHT}; }

        .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .view-tabs { display: inline-flex; border: 1px solid ${PAPER_LINE}; border-radius: 8px; overflow: hidden; background: #FFFDF8; }
        .view-tab { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; padding: 8px 13px; border: none; background: transparent; color: ${MUTED}; cursor: pointer; font-family: inherit; }
        .view-tab + .view-tab { border-left: 1px solid ${PAPER_LINE}; }
        .view-tab-on { background: ${INK}; color: ${PAPER}; }
        .period-label { font-family: 'Fraunces', serif; font-size: 18px; font-weight: 600; min-width: 190px; }
        .stat-strip { display: flex; gap: 18px; flex-wrap: wrap; padding: 12px 16px; background: ${PAPER_RAISED}; border: 1px solid ${PAPER_LINE}; border-radius: 10px; margin-bottom: 14px; }
        .stat-item { display: flex; flex-direction: column; gap: 2px; }
        .stat-label { font-size: 11px; color: ${MUTED}; letter-spacing: 0.04em; }
        .stat-value { font-family: 'IBM Plex Mono', monospace; font-size: 17px; font-weight: 600; }
        .board { background: ${PAPER_RAISED}; border: 1px solid ${PAPER_LINE}; border-radius: 10px; padding: 14px; }
        .empty-state { padding: 50px 20px; text-align: center; color: ${MUTED}; font-size: 13px; line-height: 1.7; }

        .day-scroll { overflow-x: auto; }
        .day-grid { display: grid; min-width: 520px; }
        .day-corner { border-bottom: 1px solid ${PAPER_LINE}; }
        .day-colhead { padding: 6px 8px 8px; border-bottom: 1px solid ${PAPER_LINE}; border-left: 1px solid ${PAPER_LINE}; text-align: center; }
        .time-gutter { position: relative; }
        .time-mark { position: absolute; right: 8px; transform: translateY(-50%); font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: ${MUTED}; }
        .day-col { position: relative; border-left: 1px solid ${PAPER_LINE}; cursor: crosshair; }
        .now-line { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid ${WINE}; z-index: 3; pointer-events: none; }
        .now-line span { position: absolute; left: -3px; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: ${WINE}; display: block; }
        .appt-block {
          position: absolute; left: 3px; right: 3px; border-radius: 5px; padding: 4px 7px; overflow: hidden;
          cursor: pointer; z-index: 2; box-shadow: 0 1px 2px rgba(38,33,28,0.08);
        }
        .appt-block:hover { box-shadow: 0 2px 7px rgba(38,33,28,0.18); }
        .appt-time { font-family: 'IBM Plex Mono', monospace; font-size: 10px; opacity: 0.85; }
        .appt-name { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .appt-sv { font-size: 11px; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .week-grid { display: grid; grid-template-columns: repeat(7, minmax(112px, 1fr)); gap: 6px; overflow-x: auto; }
        .week-col { background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 8px; display: flex; flex-direction: column; min-height: 200px; }
        .week-col-today { border-color: ${BRASS}; box-shadow: 0 0 0 2px rgba(169,129,47,0.12); }
        .week-colhead { display: flex; align-items: center; gap: 4px; padding: 7px 9px; font-size: 12px; border-bottom: 1px solid ${PAPER_LINE}; cursor: pointer; }
        .week-colhead:hover { background: ${BRASS_LIGHT}; }
        .week-count { margin-left: auto; font-family: 'IBM Plex Mono', monospace; color: ${MUTED}; }
        .week-body { padding: 6px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
        .week-chip { padding: 5px 7px; border-radius: 5px; cursor: pointer; }
        .week-chip:hover { filter: brightness(0.97); }
        .week-empty { color: ${PAPER_LINE}; text-align: center; padding: 14px 0; }
        .week-foot { padding: 6px 9px; border-top: 1px dashed ${PAPER_LINE}; font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: ${MUTED}; text-align: right; }

        .month-head { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
        .month-head div { text-align: center; font-size: 11px; color: ${MUTED}; padding: 4px 0; }
        .month-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
        .month-cell { background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 6px; min-height: 82px; padding: 5px; cursor: pointer; overflow: hidden; }
        .month-cell:hover { border-color: ${BRASS}; }
        .month-cell-out { opacity: 0.42; }
        .month-cell-today { border-color: ${BRASS}; box-shadow: inset 0 0 0 1px ${BRASS}; }
        .month-daynum { display: flex; align-items: center; gap: 5px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: ${MUTED}; margin-bottom: 3px; }
        .month-badge { background: ${INK}; color: ${PAPER}; border-radius: 999px; padding: 0 5px; font-size: 10px; }
        .month-chip { font-size: 10.5px; padding: 2px 4px; border-radius: 3px; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .month-more { font-size: 10px; color: ${MUTED}; }

        .list-datehead { font-family: 'Fraunces', serif; font-size: 14px; font-weight: 600; padding: 6px 2px; display: flex; gap: 8px; align-items: baseline; border-bottom: 1px solid ${PAPER_LINE}; margin-bottom: 4px; }
        .list-row { display: flex; align-items: center; gap: 10px; padding: 9px 6px; border-radius: 6px; cursor: pointer; flex-wrap: wrap; }
        .list-row:hover { background: ${BRASS_LIGHT}; }

        .sv-table { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
        .sv-row { display: grid; grid-template-columns: 1fr 92px 104px 34px; gap: 8px; align-items: center; }
        .sv-head { font-size: 11px; color: ${MUTED}; }

        .modal-backdrop { position: fixed; inset: 0; background: rgba(38,33,28,0.42); display: flex; align-items: flex-start; justify-content: center; padding: 24px 14px; z-index: 40; overflow-y: auto; }
        .modal-panel { background: ${PAPER}; border-radius: 12px; width: 100%; box-shadow: 0 18px 44px rgba(38,33,28,0.28); }
        .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid ${PAPER_LINE}; }
        .modal-body { padding: 18px; }
        .toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: ${INK}; color: ${PAPER}; padding: 10px 18px; border-radius: 999px; font-size: 13px; z-index: 60; box-shadow: 0 6px 20px rgba(38,33,28,0.3); }

        @media (max-width: 760px) {
          .form-grid-2 { grid-template-columns: 1fr; }
          .period-label { min-width: 0; font-size: 16px; }
          .sv-row { grid-template-columns: 1fr 70px 80px 30px; }
        }
      `}</style>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700 }}>預約管理</div>
          <button className="ledger-btn" onClick={() => setShowSettings(true)}><Settings size={14} /> 服務與設定</button>
        </div>

        <div className="stat-strip">
          <div className="stat-item">
            <span className="stat-label">今日預約</span>
            <span className="stat-value">{todaySummary.count} 筆</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">今日預估業績</span>
            <span className="stat-value">{fmtMoney(todaySummary.revenue)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">待確認（今天起）</span>
            <span className="stat-value" style={{ color: todaySummary.pending > 0 ? BRASS : INK }}>{todaySummary.pending} 筆</span>
          </div>
        </div>

        <div className="toolbar">
          <div className="view-tabs">
            {[["day", "日", Calendar], ["week", "週", CalendarDays], ["month", "月", CalendarDays], ["list", "清單", List], ["inbox", "申請", Inbox], ["roster", "班表", Users]].map(([k, label, Icon]) => (
              <button key={k} className={"view-tab" + (view === k ? " view-tab-on" : "")} onClick={() => setView(k)}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {view !== "list" && view !== "inbox" && view !== "roster" && (
            <>
              <button className="ledger-icon-btn" onClick={() => step(-1)} title="上一個"><ChevronLeft size={18} /></button>
              <div className="period-label">{periodLabel()}</div>
              <button className="ledger-icon-btn" onClick={() => step(1)} title="下一個"><ChevronRight size={18} /></button>
              <button className="ledger-btn" onClick={() => setAnchor(todayStr())}>今天</button>
              <input type="date" className="ledger-input" style={{ width: "auto" }} value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} />
            </>
          )}

          <div style={{ flex: 1 }} />

          {view !== "list" && view !== "inbox" && view !== "roster" && (
            <select className="ledger-input" style={{ width: "auto" }} value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="">全部分店</option>
              {STORES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          )}
          {allDesigners.length > 1 && view !== "list" && view !== "inbox" && view !== "roster" && (
            <select className="ledger-input" style={{ width: "auto" }} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
              <option value="">全部設計師</option>
              {allDesigners.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {view !== "list" && view !== "inbox" && view !== "roster" && (
            <button className="ledger-btn" onClick={exportRange} title="匯出成 .ics，可匯入 Google 日曆或手機行事曆">
              <Download size={14} /> 匯出行事曆
            </button>
          )}
          <SyncIndicator status={sync.status} message={sync.message} onPublishNow={autoPublish.publishNow} />
          <button className="ledger-btn ledger-btn-primary" onClick={() => openNew()}>
            <Plus size={15} /> 新增預約
          </button>
        </div>

        <div className="board">
          {view === "day" && (
            <DayView
              date={anchor}
              appts={dayAppts}
              designers={designers}
              customerMap={customerMap}
              settings={settings}
              onOpen={openExisting}
              roster={roster}
              onCreateAt={(date, startMin, staffId) => openNew({
                date, startMin, staffId,
                storeId: storeOfStaffOn(normalizeRoster(roster), staffId, date) || "",
              })}
            />
          )}
          {view === "week" && (
            <WeekView
              anchor={anchor}
              appts={visibleAppts}
              designers={designers}
              customerMap={customerMap}
              staffMap={staffMap}
              staffFilter={staffFilter}
              onOpen={openExisting}
              onJumpDay={(d) => { setAnchor(d); setView("day"); }}
            />
          )}
          {view === "month" && (
            <MonthView
              anchor={anchor}
              appts={visibleAppts}
              customerMap={customerMap}
              staffFilter={staffFilter}
              onJumpDay={(d) => { setAnchor(d); setView("day"); }}
            />
          )}
          {view === "list" && (
            <ListView appts={visibleAppts} customerMap={customerMap} staffMap={staffMap} onOpen={openExisting} />
          )}
          {view === "inbox" && (
            <BookingInbox
              appointments={appts}
              customers={customers}
              staff={staff}
              services={services}
              roster={roster}
              onApprove={(appt) => {
                setAppts((prev) => [...prev, appt]);
                flash("已建立預約，空檔會自動更新");
              }}
              onCreateCustomer={async (fresh) => {
                const next = [fresh, ...customers];
                setCustomers(next);
                await saveKey(CUSTOMER_KEY, next);
                return fresh;
              }}
            />
          )}
          {view === "roster" && (
            <RosterEditor
              staff={staff}
              services={services}
              roster={roster}
              onSave={async (next) => {
                setRoster(next);
                await saveKey(ROSTER_KEY, next);
                flash("班表已儲存，空檔會自動更新");
              }}
            />
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: MUTED, lineHeight: 1.7 }}>
          單日檢視點空白處可以直接在那個時段建立預約；週和月檢視點日期標題會切到那一天。
          分店篩選只影響畫面顯示——撞單判斷永遠看設計師的完整時間軸，不分店。
        </div>
      </div>

      {editing && (
        <Modal title={editingIsNew ? "新增預約" : "編輯預約"} onClose={() => setEditing(null)} wide>
          <AppointmentForm
            key={editing.id}
            appt={editing}
            isNew={editingIsNew}
            customers={customers}
            staff={staff}
            services={services}
            settings={settings}
            roster={roster}
            allAppts={appts}
            onSave={saveAppt}
            onDelete={deleteAppt}
            onClose={() => setEditing(null)}
          />
        </Modal>
      )}

      {showSettings && (
        <Modal title="服務項目與設定" onClose={() => setShowSettings(false)} wide>
          <ServiceSettings
            services={services}
            settings={settings}
            onSaveServices={(next) => { setServices(next); saveKey(SERVICE_KEY, next); }}
            onSaveSettings={(next) => { setSettings(next); saveKey(SETTINGS_KEY, next); }}
          />
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
