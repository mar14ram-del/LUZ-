// =====================================================================
// import-customers.jsx — 從 CSV 批次匯入舊客戶資料
//
// 用法：在「顧客資料」頁的工具列放 <ImportCustomersButton />。
// 選一個 CSV 檔 → 看預估（新增幾筆、更新幾筆）→ 按確認才會寫入。
//
// 對得到現有客戶時（用電話比對）只補空白欄位，不會蓋掉你已經填過的。
// 每一筆匯入的客戶都會加上「舊資料匯入」標籤，方便事後篩選。
//
// CSV 欄位名稱認得這些（順序不拘、多的欄位會忽略）：
//   姓名 性別 生日 行動電話 電話 地址 職業 備註
//   首次來店日 最近來店日 設計師 介紹人 消費累計 來店次數 失約次數
// 日期可以是 Excel 的數字（如 45162）或 2023-08-24 這種文字，都會自動處理。
// =====================================================================

import React, { useState } from "react";
import { Upload, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const IMPORT_TAG = "舊資料匯入";

const INK = "#26211C";
const PAPER_LINE = "#E3D8BE";
const BRASS = "#A9812F";
const WINE = "#7B3B34";
const SAGE = "#4F6B4F";
const MUTED = "#8A8072";

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

/* ---------- CSV 解析 ---------- */

function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 去掉 BOM
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const HEADER_ALIASES = {
  "姓名": "name", "名字": "name", "客戶姓名": "name", "顧客姓名": "name",
  "性別": "gender",
  "生日": "birthday", "出生日期": "birthday", "生日日期": "birthday",
  "行動電話": "mobile", "手機": "mobile", "手機號碼": "mobile", "行動": "mobile",
  "電話": "phone", "市話": "phone", "聯絡電話": "phone", "室內電話": "phone",
  "地址": "address", "通訊地址": "address",
  "職業": "job",
  "備註": "note", "備注": "note", "註記": "note",
  "首次來店日": "firstVisit", "首次來店": "firstVisit", "建檔日": "firstVisit",
  "建檔日期": "firstVisit", "資料建立時間": "firstVisit", "初次來店": "firstVisit",
  "最近來店日": "lastVisit", "最後來店日": "lastVisit", "最近來店": "lastVisit", "上次來店": "lastVisit",
  "設計師": "designer", "指定設計師": "designer", "專屬設計師": "designer",
  "介紹人": "referrer", "推薦人": "referrer",
  "消費累計": "totalSpend", "累積消費": "totalSpend", "消費總額": "totalSpend", "累計消費": "totalSpend",
  "來店次數": "visitCount", "來訪次數": "visitCount", "消費次數": "visitCount",
  "失約次數": "noShowCount", "爽約次數": "noShowCount", "未到次數": "noShowCount",
};

function toObjects(rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => HEADER_ALIASES[String(h || "").trim()] || null);
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => String(c || "").trim() === "")) continue;
    const o = {};
    header.forEach((key, idx) => {
      if (key && o[key] === undefined) o[key] = r[idx] != null ? r[idx] : "";
    });
    out.push(o);
  }
  return out;
}

/* ---------- 欄位清理 ---------- */

function toDate(v) {
  if (v == null) return "";
  const s = String(v).trim();
  if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n >= 15000 && n <= 80000) {
      const ms = Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
    return "";
  }
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    return m[1] + "-" + String(+m[2]).padStart(2, "0") + "-" + String(+m[3]).padStart(2, "0");
  }
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return "";
}

function toPhone(v) {
  if (!v) return "";
  const d = String(v).replace(/\D/g, "");
  if (d.length < 6) return "";
  if (/^(\d)\1+$/.test(d)) return "";        // 0000、11111 這種假號碼
  return d;
}

function cleanName(v) {
  let s = String(v == null ? "" : v).trim();
  // 舊系統匯出的姓名有時是 [名字](網址) 這種格式
  const m = s.match(/^\[(.+?)\\?\]\((?:https?:)?\/\/[^)]*\)$/);
  if (m) s = m[1].replace(/\\+$/, "").trim();
  return s;
}

function num(v) {
  const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}
function intNum(v) {
  const n = parseInt(String(v == null ? "" : v).replace(/[^0-9\-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
function normName(v) {
  return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, "");
}

function matchStaff(raw, staff) {
  const n = String(raw || "").trim().toLowerCase();
  if (!n) return null;
  let s = (staff || []).find((x) => String(x.name || "").trim().toLowerCase() === n);
  if (s) return s;
  s = (staff || []).find((x) => {
    const sn = String(x.name || "").trim().toLowerCase();
    return sn.length >= 2 && (sn.indexOf(n) >= 0 || n.indexOf(sn) >= 0);
  });
  return s || null;
}

/* ---------- 一列 CSV → 一筆客戶（部分欄位） ---------- */

function rowToRecord(row, staff) {
  const name = cleanName(row.name);
  if (!name) return null;

  const mobile = toPhone(row.mobile);
  const land = toPhone(row.phone);
  const phone = mobile || land;
  const leftoverLand = mobile && land && land !== mobile ? land : "";

  const g = String(row.gender || "").trim();
  const gender = g === "女" ? "女" : g === "男" ? "男" : "不透露";

  const sm = matchStaff(row.designer, staff);
  const stylistId = sm ? sm.id : "";
  const oldDesigner = !sm && String(row.designer || "").trim() ? String(row.designer).trim() : "";

  const lines = [];
  if (String(row.note || "").trim()) lines.push(String(row.note).trim());
  if (String(row.job || "").trim()) lines.push("職業：" + String(row.job).trim());
  if (leftoverLand) lines.push("市話：" + leftoverLand);
  if (String(row.referrer || "").trim()) lines.push("介紹人：" + String(row.referrer).trim());
  if (oldDesigner) lines.push("原設計師：" + oldDesigner);

  return {
    name,
    gender,
    birthday: toDate(row.birthday),
    phone,
    address: String(row.address || "").trim(),
    preferredStylistId: stylistId,
    notes: lines.join("\n"),
    createdDate: toDate(row.firstVisit),
    lastVisitDate: toDate(row.lastVisit),
    totalSpend: num(row.totalSpend),
    visitCount: intNum(row.visitCount),
    noShowCount: intNum(row.noShowCount),
    _oldDesigner: oldDesigner,
  };
}

function mergeNumbersAndNotes(target, extra) {
  if (!target.birthday && extra.birthday) target.birthday = extra.birthday;
  if (!target.address && extra.address) target.address = extra.address;
  if (!target.phone && extra.phone) target.phone = extra.phone;
  if ((target.gender === "不透露" || !target.gender) && extra.gender && extra.gender !== "不透露") {
    target.gender = extra.gender;
  }
  if (!target.preferredStylistId && extra.preferredStylistId) target.preferredStylistId = extra.preferredStylistId;
  if (!target.createdDate && extra.createdDate) target.createdDate = extra.createdDate;
  if (extra.lastVisitDate && extra.lastVisitDate > (target.lastVisitDate || "")) target.lastVisitDate = extra.lastVisitDate;
  target.totalSpend = Math.max(num(target.totalSpend), num(extra.totalSpend));
  target.visitCount = Math.max(intNum(target.visitCount), intNum(extra.visitCount));
  target.noShowCount = Math.max(intNum(target.noShowCount), intNum(extra.noShowCount));
  const have = new Set(String(target.notes || "").split("\n").map((s) => s.trim()).filter(Boolean));
  String(extra.notes || "").split("\n").map((s) => s.trim()).filter(Boolean).forEach((l) => {
    if (!have.has(l)) { have.add(l); target.notes = (target.notes ? target.notes + "\n" : "") + l; }
  });
}

/* ---------- 整份 CSV → 分析報告 + 套用函式 ---------- */

export function analyzeCSV(csvText, staff, existing, blankCustomer) {
  const objs = toObjects(parseCSV(csvText));
  if (objs.length === 0) {
    return { error: "這個檔案裡沒有讀到任何資料列，請確認是 CSV 格式、而且第一列是欄位名稱。" };
  }
  const hasName = objs.some((o) => o.name !== undefined);
  if (!hasName) {
    return { error: "找不到「姓名」欄位。請確認 CSV 第一列有「姓名」這個欄位名稱。" };
  }

  let skippedNoName = 0;
  const records = [];
  const unmatched = {};
  objs.forEach((o) => {
    const rec = rowToRecord(o, staff);
    if (!rec) { skippedNoName++; return; }
    if (rec._oldDesigner) unmatched[rec._oldDesigner] = (unmatched[rec._oldDesigner] || 0) + 1;
    records.push(rec);
  });

  // CSV 內同一人（電話+姓名相同）合併
  const dedupMap = new Map();
  const deduped = [];
  let mergedInCsv = 0;
  records.forEach((r) => {
    const d = toPhone(r.phone);
    if (!d) { deduped.push(r); return; }
    const k = d + "|" + normName(r.name);
    if (dedupMap.has(k)) { mergeNumbersAndNotes(dedupMap.get(k), r); mergedInCsv++; }
    else { dedupMap.set(k, r); deduped.push(r); }
  });

  // 對現有客戶
  const byKey = new Map();
  const byPhone = new Map();
  (existing || []).forEach((c) => {
    const d = toPhone(c.phone);
    if (!d) return;
    const kk = d + "|" + normName(c.name);
    if (!byKey.has(kk)) byKey.set(kk, true);
    if (!byPhone.has(d)) byPhone.set(d, true);
  });
  let toAdd = 0;
  let toUpdate = 0;
  let noPhone = 0;
  deduped.forEach((r) => {
    const d = toPhone(r.phone);
    if (!d) { noPhone++; toAdd++; return; }
    if (byKey.has(d + "|" + normName(r.name)) || byPhone.has(d)) toUpdate++;
    else toAdd++;
  });

  const report = {
    totalRows: objs.length,
    skippedNoName,
    validRecords: records.length,
    mergedInCsv,
    toAdd,
    toUpdate,
    noPhone,
    unmatched,
    sample: deduped.slice(0, 15),
  };

  function apply() {
    const result = (existing || []).map((c) => ({
      ...c,
      tags: Array.isArray(c.tags) ? c.tags.slice() : [],
    }));
    const idxByKey = new Map();
    const idxByPhone = new Map();
    result.forEach((c) => {
      const d = toPhone(c.phone);
      if (!d) return;
      const kk = d + "|" + normName(c.name);
      if (!idxByKey.has(kk)) idxByKey.set(kk, c);
      if (!idxByPhone.has(d)) idxByPhone.set(d, c);
    });

    deduped.forEach((r) => {
      const d = toPhone(r.phone);
      let target = null;
      if (d) target = idxByKey.get(d + "|" + normName(r.name)) || idxByPhone.get(d) || null;
      if (target) {
        mergeNumbersAndNotes(target, r);
        if (!target.tags.includes(IMPORT_TAG)) target.tags.push(IMPORT_TAG);
      } else {
        const base = blankCustomer();
        const fresh = {
          ...base,
          id: uid(),
          name: r.name,
          gender: r.gender,
          birthday: r.birthday,
          phone: r.phone,
          address: r.address,
          preferredStylistId: r.preferredStylistId,
          notes: r.notes,
          createdDate: r.createdDate || base.createdDate,
          lastVisitDate: r.lastVisitDate,
          totalSpend: r.totalSpend,
          visitCount: r.visitCount,
          noShowCount: r.noShowCount,
          source: "其他",
          tags: [IMPORT_TAG],
        };
        result.push(fresh);
        if (d) {
          idxByKey.set(d + "|" + normName(r.name), fresh);
          if (!idxByPhone.has(d)) idxByPhone.set(d, fresh);
        }
      }
    });
    return result;
  }

  return { report, apply };
}

/* ---------- UI ---------- */

export function ImportCustomersButton({ staff, customers, blankCustomer, onMerged, saveCustomers }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("pick"); // pick | working | preview | done | error
  const [msg, setMsg] = useState("");
  const [analysis, setAnalysis] = useState(null);

  function reset() {
    setStage("pick");
    setMsg("");
    setAnalysis(null);
  }
  function close() {
    setOpen(false);
    reset();
  }

  function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setStage("working");
    setMsg("讀取中…");
    const reader = new FileReader();
    reader.onerror = () => { setStage("error"); setMsg("檔案讀取失敗，請再試一次。"); };
    reader.onload = () => {
      try {
        const a = analyzeCSV(String(reader.result || ""), staff || [], customers || [], blankCustomer);
        if (a.error) { setStage("error"); setMsg(a.error); return; }
        setAnalysis(a);
        setStage("preview");
      } catch (err) {
        setStage("error");
        setMsg("解析時發生問題：" + (err && err.message ? err.message : String(err)));
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function confirmImport() {
    if (!analysis) return;
    setStage("working");
    setMsg("寫入中…（資料多的話要十幾秒，請不要關掉視窗）");
    setTimeout(async () => {
      try {
        const merged = analysis.apply();
        let ok = true;
        if (saveCustomers) ok = await saveCustomers(merged);
        if (ok === false) {
          setStage("error");
          setMsg("寫入資料庫失敗，可能是一次寫入的量太大或網路問題。你的原有資料沒有變動，請把這個訊息告訴工程師。");
          return;
        }
        onMerged(merged);
        setStage("done");
        setMsg("完成！新增 " + analysis.report.toAdd + " 位，更新 " + analysis.report.toUpdate + " 位。");
      } catch (err) {
        setStage("error");
        setMsg("寫入時發生問題：" + (err && err.message ? err.message : String(err)));
      }
    }, 50);
  }

  const r = analysis && analysis.report;
  const unmatchedList = r ? Object.keys(r.unmatched) : [];

  return (
    <>
      <button
        className="ledger-btn"
        style={{ justifyContent: "center" }}
        onClick={() => setOpen(true)}
        title="從舊系統匯出的 CSV 批次匯入客戶"
      >
        <Upload size={15} /> 匯入 CSV
      </button>

      {open && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, background: "rgba(38,33,28,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#FFFDF8", borderRadius: 12, border: "1px solid " + PAPER_LINE,
              width: "100%", maxWidth: 560, maxHeight: "88vh", overflowY: "auto", padding: 22,
              fontFamily: "'IBM Plex Sans', sans-serif", color: INK,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700 }}>匯入客戶（CSV）</div>
              <button className="ledger-icon-btn" onClick={close} aria-label="關閉"><X size={16} /></button>
            </div>

            {stage === "pick" && (
              <div>
                <p style={{ fontSize: 13, lineHeight: 1.8, color: MUTED }}>
                  選一個 CSV 檔。第一列要是欄位名稱，認得：姓名、性別、生日、行動電話、電話、地址、
                  職業、備註、首次來店日、最近來店日、設計師、介紹人、消費累計、來店次數、失約次數。
                  日期用 Excel 數字或 2023-08-24 這種格式都可以。
                </p>
                <label className="ledger-btn ledger-btn-primary" style={{ justifyContent: "center", cursor: "pointer" }}>
                  <Upload size={15} /> 選擇 CSV 檔
                  <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
                </label>
              </div>
            )}

            {stage === "working" && (
              <div style={{ padding: "30px 0", textAlign: "center", color: MUTED, fontSize: 13 }}>
                <Loader2 size={22} className="ba-spin" style={{ animation: "ba-spin 1s linear infinite" }} /><br />
                <style>{"@keyframes ba-spin{to{transform:rotate(360deg)}}"}</style>
                {msg}
              </div>
            )}

            {stage === "error" && (
              <div>
                <div style={{ display: "flex", gap: 8, background: "#F2E1DE", color: WINE, padding: "10px 12px", borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
                </div>
                <button className="ledger-btn" style={{ marginTop: 14 }} onClick={reset}>重新選檔</button>
              </div>
            )}

            {stage === "preview" && r && (
              <div>
                <div style={{ border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 2 }}>
                  <div>讀到資料列：<b>{r.totalRows}</b></div>
                  {r.skippedNoName > 0 && <div style={{ color: MUTED }}>沒有姓名、略過：{r.skippedNoName}</div>}
                  {r.mergedInCsv > 0 && <div style={{ color: MUTED }}>檔案內同一人合併：{r.mergedInCsv}</div>}
                  <div style={{ color: SAGE }}>將新增：<b>{r.toAdd}</b> 位</div>
                  <div style={{ color: BRASS }}>將更新現有客戶（只補空白欄位）：<b>{r.toUpdate}</b> 位</div>
                  {r.noPhone > 0 && <div style={{ color: MUTED }}>其中沒有電話的舊資料：{r.noPhone}</div>}
                </div>

                {unmatchedList.length > 0 && (
                  <div style={{ marginTop: 12, fontSize: 12.5, color: MUTED, lineHeight: 1.7 }}>
                    對不到系統設計師的名字（這些客戶設計師欄留空，原名記到備註）：<br />
                    {unmatchedList.map((k) => k + "（" + r.unmatched[k] + "）").join("、")}
                  </div>
                )}

                <div style={{ marginTop: 14, fontSize: 12, color: MUTED, marginBottom: 6 }}>前 {r.sample.length} 筆預覽：</div>
                <div style={{ border: "1px solid " + PAPER_LINE, borderRadius: 8, overflow: "hidden" }}>
                  {r.sample.map((s, i) => (
                    <div key={i} style={{ padding: "7px 10px", fontSize: 12, borderTop: i ? "1px solid " + PAPER_LINE : "none", lineHeight: 1.6 }}>
                      <b>{s.name}</b>　{s.gender}
                      {s.phone ? "　" + s.phone : "　(無電話)"}
                      {s.birthday ? "　生日 " + s.birthday : ""}
                      {s.totalSpend ? "　消費 " + s.totalSpend : ""}
                      {s.notes ? <div style={{ color: MUTED }}>{s.notes.replace(/\n/g, "／")}</div> : null}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button className="ledger-btn" onClick={reset}>重新選檔</button>
                  <div style={{ flex: 1 }} />
                  <button className="ledger-btn ledger-btn-primary" onClick={confirmImport}>
                    確認匯入（新增 {r.toAdd} / 更新 {r.toUpdate}）
                  </button>
                </div>
              </div>
            )}

            {stage === "done" && (
              <div>
                <div style={{ display: "flex", gap: 8, background: "#E3EADD", color: SAGE, padding: "12px 14px", borderRadius: 8, fontSize: 14, lineHeight: 1.6 }}>
                  <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} />{msg}
                </div>
                <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.8, marginTop: 12 }}>
                  匯入的客戶都加了「舊資料匯入」標籤，用左邊的標籤篩選就能看到。
                  發現哪裡不對的話，直接改那筆客戶資料即可。
                </p>
                <button className="ledger-btn ledger-btn-primary" style={{ marginTop: 4 }} onClick={close}>知道了</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
