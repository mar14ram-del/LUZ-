import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Trash2, Pencil, X, Search, Phone, Tag, Camera, AlertTriangle,
  Users, Save, ChevronDown, Star,
} from "lucide-react";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const PAPER_RAISED = "#FCFAF3";
const BRASS = "#A9812F";
const WINE = "#7B3B34";
const WINE_LIGHT = "#F2E1DE";
const SAGE = "#4F6B4F";
const SAGE_LIGHT = "#E3EADD";
const MUTED = "#8A8072";

const CUSTOMER_KEY = "customers:list";
const STAFF_KEY = "finance:staff";

const GENDER_OPTIONS = ["女", "男", "不透露"];
const SCALP_OPTIONS = ["中性", "偏油", "偏乾", "敏感"];
const SOURCE_OPTIONS = ["朋友介紹", "Google", "Instagram", "Facebook", "路過", "其他"];
const TIER_OPTIONS = ["一般", "銀卡", "金卡", "VIP"];
const REMINDER_OPTIONS = ["LINE", "簡訊", "電話", "不需要"];
const TAG_SUGGESTIONS = ["敏感肌", "常染髮", "半年沒來", "新客", "VIP", "指定設計師"];

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
}
function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return "NT$" + v.toLocaleString("zh-TW");
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function blankCustomer() {
  return {
    id: uid(), name: "", nickname: "", gender: "女", birthday: "", phone: "", lineId: "",
    address: "", createdDate: todayStr(), source: SOURCE_OPTIONS[0],
    hairType: "", scalpCondition: SCALP_OPTIONS[0], preferredStylistId: "", preferredStyle: "",
    dislikedStyle: "", allergies: "",
    serviceLog: [],
    totalSpend: 0, visitCount: 0, lastVisitDate: "", commonServices: "", prepaidBalance: 0,
    memberTier: TIER_OPTIONS[0], coupons: "",
    preferredTimeSlot: "", noShowCount: 0, reminderPref: REMINDER_OPTIONS[0],
    tags: [], notes: "", marketingConsent: true,
    photos: [], specialStatus: "",
  };
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

function resizeImageFile(file, maxWidth = 480, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("讀取檔案失敗"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("圖片載入失敗"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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
      <button onClick={() => { setArmed(false); onConfirm(); }} className="ledger-btn ledger-btn-danger" style={{ fontSize: 12 }}>
        確定{label || "刪除"}？
      </button>
    );
  }
  return (
    <button onClick={() => setArmed(true)} className="ledger-icon-btn" aria-label={label || "刪除"} title={label || "刪除"}>
      <Trash2 size={15} />
    </button>
  );
}

function TagInput({ tags, onChange }) {
  const [text, setText] = useState("");
  function addTag(t) {
    const v = t.trim();
    if (!v || tags.includes(v)) return;
    onChange([...tags, v]);
    setText("");
  }
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {tags.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <X size={11} style={{ cursor: "pointer" }} onClick={() => onChange(tags.filter((x) => x !== t))} />
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => addTag(s)}>+ {s}</button>
        ))}
      </div>
      <input
        className="ledger-input" placeholder="輸入自訂標籤按 Enter 新增" value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(text); } }}
      />
    </div>
  );
}

function PhotoUploader({ photos, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      const newPhotos = [];
      for (const f of files.slice(0, 6)) {
        const dataUrl = await resizeImageFile(f);
        newPhotos.push({ id: uid(), dataUrl, date: todayStr() });
      }
      onChange([...photos, ...newPhotos]);
    } catch (err) {
      setError("上傳失敗，請換一張圖片再試");
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        {photos.map((p) => (
          <div key={p.id} style={{ position: "relative", width: 72, height: 72 }}>
            <img src={p.dataUrl} alt="顧客照片" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid " + PAPER_LINE }} />
            <button
              type="button" onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
              style={{
                position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
                background: WINE, color: "white", border: "none", cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
              }}
              aria-label="移除照片"
            ><X size={12} /></button>
          </div>
        ))}
      </div>
      <label className="ledger-btn" style={{ display: "inline-flex", cursor: "pointer" }}>
        <Camera size={14} /> {busy ? "處理中…" : "上傳照片"}
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: "none" }} />
      </label>
      {error && <div style={{ color: WINE, fontSize: 12, marginTop: 6 }}>{error}</div>}
      <div style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>照片會自動縮小以節省空間，每位顧客建議 6 張以內。</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field-label">
      {label}
      {children}
    </label>
  );
}

function Section({ title, defaultOpen, children }) {
  return (
    <details open={defaultOpen} className="cust-section">
      <summary className="cust-section-summary">
        <ChevronDown size={14} className="chev" />
        {title}
      </summary>
      <div className="cust-section-body">{children}</div>
    </details>
  );
}

function CustomerForm({ customer, staff, onSave, onCancel, onDelete, isNew }) {
  const [form, setForm] = useState(customer);
  useEffect(() => { setForm(customer); }, [customer.id]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%", background: SAGE_LIGHT, color: SAGE,
            display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', serif",
            fontWeight: 600, fontSize: 16, flexShrink: 0,
          }}>{(form.name || "?").slice(0, 1)}</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: INK }}>
            {isNew ? "新增顧客" : form.name || "未命名顧客"}
          </div>
          {form.memberTier !== "一般" && (
            <span className="tier-badge"><Star size={11} /> {form.memberTier}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {!isNew && <ConfirmDelete onConfirm={() => onDelete(form.id)} label="刪除顧客" />}
          <button type="button" className="ledger-btn" onClick={onCancel}>取消</button>
          <button type="submit" className="ledger-btn ledger-btn-primary"><Save size={14} /> 儲存</button>
        </div>
      </div>

      {form.allergies && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, background: WINE_LIGHT, color: WINE,
          padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
        }}>
          <AlertTriangle size={15} /> 過敏 / 注意事項：{form.allergies}
        </div>
      )}

      <Section title="基本資料" defaultOpen>
        <div className="form-grid-2">
          <Field label="姓名"><input className="ledger-input" value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
          <Field label="暱稱"><input className="ledger-input" value={form.nickname} onChange={(e) => set("nickname", e.target.value)} /></Field>
          <Field label="性別"><select className="ledger-input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>{GENDER_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="生日"><input type="date" className="ledger-input" value={form.birthday} onChange={(e) => set("birthday", e.target.value)} /></Field>
          <Field label="手機號碼"><input className="ledger-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="LINE ID"><input className="ledger-input" value={form.lineId} onChange={(e) => set("lineId", e.target.value)} /></Field>
          <Field label="地址"><input className="ledger-input" value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="建檔日期"><input type="date" className="ledger-input" value={form.createdDate} onChange={(e) => set("createdDate", e.target.value)} /></Field>
          <Field label="顧客來源"><select className="ledger-input" value={form.source} onChange={(e) => set("source", e.target.value)}>{SOURCE_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></Field>
        </div>
      </Section>

      <Section title="髮質與服務偏好">
        <div className="form-grid-2">
          <Field label="髮質"><input className="ledger-input" placeholder="例如：細軟、量少、自然捲" value={form.hairType} onChange={(e) => set("hairType", e.target.value)} /></Field>
          <Field label="頭皮狀況"><select className="ledger-input" value={form.scalpCondition} onChange={(e) => set("scalpCondition", e.target.value)}>{SCALP_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="慣用設計師">
            <select className="ledger-input" value={form.preferredStylistId} onChange={(e) => set("preferredStylistId", e.target.value)}>
              <option value="">— 不指定 —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="偏好風格"><input className="ledger-input" placeholder="例如：自然色、日常好整理" value={form.preferredStyle} onChange={(e) => set("preferredStyle", e.target.value)} /></Field>
        </div>
        <Field label="不喜歡的服務 / 風格"><input className="ledger-input" value={form.dislikedStyle} onChange={(e) => set("dislikedStyle", e.target.value)} /></Field>
        <Field label="過敏史 / 特殊注意事項"><input className="ledger-input" placeholder="例如：染劑過敏、皮膚敏感" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} /></Field>
        <Field label="染燙配方 / 用藥紀錄（自由填寫，可累積記錄）"><textarea className="ledger-input" rows={3} value={form.colorFormula || ""} onChange={(e) => set("colorFormula", e.target.value)} placeholder="例如：2026/07 染劑 A牌 6.0 + 8vol 1:1，或燙髮藥水種類與卷度" /></Field>
      </Section>

      <Section title="消費與往來記錄">
        <div className="form-grid-2">
          <Field label="累積消費金額 (NT$)"><input type="number" className="ledger-input" value={form.totalSpend} onChange={(e) => set("totalSpend", e.target.value)} /></Field>
          <Field label="到店次數"><input type="number" className="ledger-input" value={form.visitCount} onChange={(e) => set("visitCount", e.target.value)} /></Field>
          <Field label="上次到店日期"><input type="date" className="ledger-input" value={form.lastVisitDate} onChange={(e) => set("lastVisitDate", e.target.value)} /></Field>
          <Field label="儲值金 / 預付卡餘額 (NT$)"><input type="number" className="ledger-input" value={form.prepaidBalance} onChange={(e) => set("prepaidBalance", e.target.value)} /></Field>
          <Field label="會員等級"><select className="ledger-input" value={form.memberTier} onChange={(e) => set("memberTier", e.target.value)}>{TIER_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="優惠券 / 折扣資格"><input className="ledger-input" value={form.coupons} onChange={(e) => set("coupons", e.target.value)} /></Field>
        </div>
        <Field label="常做的服務項目"><input className="ledger-input" placeholder="例如：剪髮、護髮" value={form.commonServices} onChange={(e) => set("commonServices", e.target.value)} /></Field>
      </Section>

      <Section title="預約相關">
        <div className="form-grid-2">
          <Field label="慣用預約時段"><input className="ledger-input" placeholder="例如：平日下午" value={form.preferredTimeSlot} onChange={(e) => set("preferredTimeSlot", e.target.value)} /></Field>
          <Field label="No-show 次數"><input type="number" className="ledger-input" value={form.noShowCount} onChange={(e) => set("noShowCount", e.target.value)} /></Field>
          <Field label="預約提醒偏好"><select className="ledger-input" value={form.reminderPref} onChange={(e) => set("reminderPref", e.target.value)}>{REMINDER_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></Field>
        </div>
      </Section>

      <Section title="行銷與關係經營">
        <Field label="標籤">
          <TagInput tags={form.tags} onChange={(tags) => set("tags", tags)} />
        </Field>
        <Field label="備註（設計師交接用）"><textarea className="ledger-input" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: INK }}>
          <input type="checkbox" checked={form.marketingConsent} onChange={(e) => set("marketingConsent", e.target.checked)} />
          同意接收行銷通知
        </label>
      </Section>

      <Section title="其他">
        <Field label="照片（髮型前後對照）">
          <PhotoUploader photos={form.photos || []} onChange={(photos) => set("photos", photos)} />
        </Field>
        <Field label="特殊身分"><input className="ledger-input" placeholder="例如：員工親友、合作對象" value={form.specialStatus} onChange={(e) => set("specialStatus", e.target.value)} /></Field>
      </Section>
    </form>
  );
}

function CustomerListItem({ c, active, onClick }) {
  return (
    <div className={"cust-list-item" + (active ? " cust-list-item-on" : "")} onClick={onClick}>
      <div style={{
        width: 34, height: 34, borderRadius: "50%", background: active ? BRASS : PAPER, color: active ? "white" : MUTED,
        display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', serif",
        fontWeight: 600, fontSize: 14, flexShrink: 0,
      }}>{(c.name || "?").slice(0, 1)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.name || "未命名"} {c.nickname && <span style={{ color: MUTED, fontWeight: 400 }}>（{c.nickname}）</span>}
        </div>
        <div style={{ fontSize: 12, color: MUTED, display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
          {c.phone && <span><Phone size={10} style={{ verticalAlign: -1 }} /> {c.phone}</span>}
          {c.tags && c.tags.length > 0 && <span><Tag size={10} style={{ verticalAlign: -1 }} /> {c.tags.slice(0, 2).join("、")}</span>}
        </div>
      </div>
    </div>
  );
}

export default function SalonCustomerApp() {
  const [loaded, setLoaded] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [draftNew, setDraftNew] = useState(null);

  useEffect(() => {
    (async () => {
      const [cs, st] = await Promise.all([loadKey(CUSTOMER_KEY, []), loadKey(STAFF_KEY, [])]);
      setCustomers(cs);
      setStaff(st);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveKey(CUSTOMER_KEY, customers); }, [customers, loaded]);

  const allTags = useMemo(() => {
    const set = new Set();
    customers.forEach((c) => (c.tags || []).forEach((t) => set.add(t)));
    return Array.from(set);
  }, [customers]);

  const filtered = useMemo(() => {
    return customers
      .filter((c) => !tagFilter || (c.tags || []).includes(tagFilter))
      .filter((c) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q) || (c.nickname || "").toLowerCase().includes(q);
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh-TW"));
  }, [customers, search, tagFilter]);

  const selected = isNew ? draftNew : customers.find((c) => c.id === selectedId);

  function startNew() {
    const c = blankCustomer();
    setDraftNew(c);
    setIsNew(true);
    setSelectedId(null);
  }
  function select(id) {
    setIsNew(false);
    setSelectedId(id);
  }
  function save(form) {
    const normalized = {
      ...form,
      totalSpend: parseFloat(form.totalSpend) || 0,
      visitCount: parseInt(form.visitCount) || 0,
      prepaidBalance: parseFloat(form.prepaidBalance) || 0,
      noShowCount: parseInt(form.noShowCount) || 0,
    };
    setCustomers((prev) => {
      const exists = prev.find((c) => c.id === form.id);
      if (exists) return prev.map((c) => (c.id === form.id ? normalized : c));
      return [normalized, ...prev];
    });
    setIsNew(false);
    setSelectedId(form.id);
  }
  function remove(id) {
    setCustomers((prev) => prev.filter((c) => c.id !== id));
    setSelectedId(null);
  }
  function cancel() {
    setIsNew(false);
  }

  if (!loaded) {
    return <div style={{ padding: 60, textAlign: "center", color: MUTED, fontFamily: "'IBM Plex Sans', sans-serif" }}>顧客資料載入中…</div>;
  }

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", background: PAPER, color: INK, minHeight: "100vh", padding: "0 0 60px" }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        .field-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${MUTED}; margin-bottom: 10px; }
        .ledger-input {
          font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; color: ${INK};
          background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 6px;
          padding: 8px 10px; outline: none; width: 100%; resize: vertical;
        }
        .ledger-input:focus { border-color: ${BRASS}; box-shadow: 0 0 0 2px rgba(169,129,47,0.15); }
        .ledger-btn {
          display: inline-flex; align-items: center; gap: 6px; font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px; font-weight: 500; color: ${INK}; background: #FFFDF8;
          border: 1px solid ${PAPER_LINE}; border-radius: 6px; padding: 8px 14px; cursor: pointer;
        }
        .ledger-btn:hover { border-color: ${BRASS}; }
        .ledger-btn-primary { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .ledger-btn-primary:hover { background: #3A322A; }
        .ledger-btn-danger { background: ${WINE}; color: white; border-color: ${WINE}; }
        .ledger-icon-btn {
          display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
          border-radius: 6px; border: 1px solid transparent; background: transparent; color: ${MUTED}; cursor: pointer;
        }
        .ledger-icon-btn:hover { background: ${PAPER}; color: ${INK}; }
        .chip {
          font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; padding: 5px 10px; border-radius: 999px;
          border: 1px solid ${PAPER_LINE}; background: #FFFDF8; color: ${MUTED}; cursor: pointer;
        }
        .chip-on { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .tag-chip {
          display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 4px 10px;
          border-radius: 999px; background: ${SAGE_LIGHT}; color: ${SAGE}; font-weight: 500;
        }
        .tier-badge {
          display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px;
          border-radius: 999px; background: #F4E7C8; color: ${BRASS}; font-weight: 600;
        }
        .cust-list-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; cursor: pointer;
        }
        .cust-list-item:hover { background: ${PAPER}; }
        .cust-list-item-on { background: #F4E7C8; }
        .cust-section {
          border: 1px solid ${PAPER_LINE}; border-radius: 8px; background: #FFFDF8; margin-bottom: 10px;
        }
        .cust-section-summary {
          list-style: none; cursor: pointer; padding: 10px 14px; font-size: 13px; font-weight: 600;
          color: ${INK}; display: flex; align-items: center; gap: 8px;
        }
        .cust-section-summary::-webkit-details-marker { display: none; }
        .cust-section[open] .chev { transform: rotate(0deg); }
        .cust-section:not([open]) .chev { transform: rotate(-90deg); }
        .cust-section-body { padding: 4px 14px 14px; }
        .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
        @media (max-width: 760px) {
          .responsive-grid { grid-template-columns: 1fr !important; }
          .form-grid-2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: INK }}>顧客資料</div>
          <div style={{ fontSize: 12, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>共 {customers.length} 位顧客</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }} className="responsive-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="ledger-btn ledger-btn-primary" style={{ justifyContent: "center" }} onClick={startNew}>
              <Plus size={15} /> 新增顧客
            </button>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: MUTED }} />
              <input className="ledger-input" style={{ paddingLeft: 30 }} placeholder="搜尋姓名、暱稱或電話" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {allTags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button className={"chip" + (!tagFilter ? " chip-on" : "")} onClick={() => setTagFilter("")}>全部</button>
                {allTags.map((t) => (
                  <button key={t} className={"chip" + (tagFilter === t ? " chip-on" : "")} onClick={() => setTagFilter(tagFilter === t ? "" : t)}>{t}</button>
                ))}
              </div>
            )}
            <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 6, display: "flex", flexDirection: "column", gap: 2, maxHeight: 560, overflowY: "auto" }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: 13 }}>
                  <Users size={20} style={{ marginBottom: 6, opacity: 0.5 }} /><br />找不到符合的顧客
                </div>
              ) : filtered.map((c) => (
                <CustomerListItem key={c.id} c={c} active={selectedId === c.id && !isNew} onClick={() => select(c.id)} />
              ))}
            </div>
          </div>

          <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 20 }}>
            {!selected ? (
              <div style={{ textAlign: "center", color: MUTED, padding: "60px 20px" }}>
                從左側選擇一位顧客，或點「新增顧客」開始建立資料。
              </div>
            ) : (
              <CustomerForm
                key={selected.id}
                customer={selected}
                staff={staff}
                isNew={isNew}
                onSave={save}
                onCancel={cancel}
                onDelete={remove}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
