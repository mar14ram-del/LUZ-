import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Plus, Trash2, Pencil, X, TrendingUp, TrendingDown, Wallet, Users,
  CalendarCheck, BarChart3, Check, ChevronLeft, ChevronRight, Receipt, Package,
} from "lucide-react";
import { loadKey, saveKey } from "./storage";
import PayrollLock from "./payroll-lock";
import { STORES, storeName, BRAND } from "./stores";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`;

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const PAPER_RAISED = "#FCFAF3";
const BRASS = "#A9812F";
const BRASS_DARK = "#7C5E20";
const BRASS_LIGHT = "#F4E7C8";
const WINE = "#7B3B34";
const WINE_LIGHT = "#F2E1DE";
const SAGE = "#4F6B4F";
const SAGE_LIGHT = "#E3EADD";
const MUTED = "#8A8072";

const INCOME_CATEGORIES = ["剪髮", "染燙", "護髮", "頭皮護理", "產品銷售", "其他收入"];
const EXPENSE_CATEGORIES = ["物料耗材", "房租", "水電瓦斯", "行銷廣告", "設備維修", "員工薪資", "其他支出"];
const PAYMENT_METHODS = ["現金", "信用卡", "行動支付", "銀行轉帳"];

const TX_KEY = "finance:transactions";
const STAFF_KEY = "finance:staff";
const CLOSING_KEY = "finance:closings";
const ASSISTANT_ITEMS_KEY = "finance:assistantItems";
const DESIGNER_DEDUCTIONS_KEY = "finance:designerDeductions";
const ITEM_TEMPLATES_KEY = "finance:staffItemTemplates";
const MATERIALS_KEY = "finance:materials";

const ALL_STORES = "__all__";
const NO_STORE = "__none__";

/** 依分店篩選交易。未指定分店的舊資料歸在「未指定」。 */
function filterByStore(txs, storeId) {
  if (!storeId || storeId === ALL_STORES) return txs;
  if (storeId === NO_STORE) return txs.filter((t) => !t.storeId);
  return txs.filter((t) => t.storeId === storeId);
}
const DEFAULT_ASSISTANT_TEMPLATES = ["全勤獎金", "業績獎金", "交通津貼", "伙食津貼", "遲到扣款", "請假扣款"];
const DEFAULT_MATERIAL_RATE = 10;

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
}
function groupTx(list) {
  const map = new Map();
  const order = [];
  list.forEach((t) => {
    const gid = t.groupId || t.id;
    if (!map.has(gid)) {
      map.set(gid, {
        groupId: gid, date: t.date, type: t.type, note: t.note,
        paymentMethod: t.paymentMethod, staffId: t.staffId, storeId: t.storeId || "",
        items: [], amount: 0,
      });
      order.push(gid);
    }
    const g = map.get(gid);
    g.items.push({ id: t.id, category: t.category, amount: t.amount });
    g.amount += t.amount;
  });
  return order.map((gid) => map.get(gid));
}
function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return "NT$" + v.toLocaleString("zh-TW");
}
function fmtSigned(n) {
  const v = Math.round(Number(n) || 0);
  return (v >= 0 ? "+" : "") + v.toLocaleString("zh-TW");
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthKey(dateStr) {
  return (dateStr || "").slice(0, 7);
}
function monthLabel(mk) {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return y + "年" + Number(m) + "月";
}
function addMonths(mk, delta) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function last6Months(mk) {
  const arr = [];
  for (let i = 5; i >= 0; i--) arr.push(addMonths(mk, -i));
  return arr;
}


function StatCard({ label, value, tone, icon }) {
  const toneColor = tone === "income" ? SAGE : tone === "expense" ? WINE : INK;
  return (
    <div style={{
      background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10,
      padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: MUTED, fontSize: 13, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 22,
        color: toneColor, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums",
      }}>{value}</div>
    </div>
  );
}

function ConfirmDelete({ onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  if (armed) {
    return (
      <button onClick={() => { setArmed(false); onConfirm(); }} className="ledger-btn ledger-btn-danger" style={{ fontSize: 12 }}>
        確定刪除？
      </button>
    );
  }
  return (
    <button onClick={() => setArmed(true)} className="ledger-icon-btn" aria-label="刪除" title="刪除">
      <Trash2 size={15} />
    </button>
  );
}

function CategoryLineEditor({ rows, categories, type, materials, onChange }) {
  function updateRow(id, patch) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    const used = new Set(rows.map((r) => r.category));
    const next = categories.find((c) => !used.has(c)) || categories[0];
    onChange([...rows, { id: uid(), category: next, amount: "", materialId: "", qty: 1 }]);
  }
  function removeRow(id) {
    if (rows.length <= 1) return;
    onChange(rows.filter((r) => r.id !== id));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, background: PAPER, borderRadius: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <select className="ledger-input" style={{ flex: 1 }} value={r.category} onChange={(e) => updateRow(r.id, { category: e.target.value })}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="ledger-input" style={{ width: 90 }} type="number" min="0" placeholder="金額" value={r.amount} onChange={(e) => updateRow(r.id, { amount: e.target.value })} />
            {rows.length > 1 && (
              <button type="button" className="ledger-icon-btn" onClick={() => removeRow(r.id)} aria-label="移除這個分類"><X size={14} /></button>
            )}
          </div>
          {type === "income" && r.category === "產品銷售" && materials.length > 0 && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select className="ledger-input" style={{ flex: 1 }} value={r.materialId} onChange={(e) => updateRow(r.id, { materialId: e.target.value })}>
                <option value="">— 不扣庫存 —</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.name}（庫存 {m.stock}{m.unit}）</option>)}
              </select>
              {r.materialId && (
                <input className="ledger-input" style={{ width: 70 }} type="number" min="0" step="1" value={r.qty} onChange={(e) => updateRow(r.id, { qty: e.target.value })} placeholder="數量" />
              )}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="ledger-btn" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={addRow}>
        <Plus size={13} /> 加一個分類（例如順便買產品）
      </button>
    </div>
  );
}

function TxForm({ onAdd, staff, materials, defaultStoreId }) {
  const [type, setType] = useState("income");
  const [date, setDate] = useState(todayStr());
  const [storeId, setStoreId] = useState(defaultStoreId || STORES[0].id);
  const [rows, setRows] = useState([{ id: uid(), category: INCOME_CATEGORIES[0], amount: "", materialId: "", qty: 1 }]);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState("現金");
  const [staffId, setStaffId] = useState("");
  const [error, setError] = useState("");

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  useEffect(() => {
    setRows([{ id: uid(), category: categories[0], amount: "", materialId: "", qty: 1 }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  useEffect(() => {
    if (defaultStoreId) setStoreId(defaultStoreId);
  }, [defaultStoreId]);

  function submit(e) {
    e.preventDefault();
    const validRows = rows
      .map((r) => ({ ...r, amount: parseFloat(r.amount) || 0, qty: parseFloat(r.qty) || 0 }))
      .filter((r) => r.amount > 0);
    if (validRows.length === 0) {
      setError("至少要填一筆金額");
      return;
    }
    onAdd(validRows, {
      type, date, note: note.trim(), paymentMethod: payment, storeId,
      staffId: type === "income" ? (staffId || null) : null,
    });
    setRows([{ id: uid(), category: categories[0], amount: "", materialId: "", qty: 1 }]);
    setNote("");
    setError("");
  }

  return (
    <form onSubmit={submit} style={{
      background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10,
      padding: 18, display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => setType("income")} className={"toggle-pill" + (type === "income" ? " toggle-pill-on-income" : "")}>
          <TrendingUp size={14} /> 收入
        </button>
        <button type="button" onClick={() => setType("expense")} className={"toggle-pill" + (type === "expense" ? " toggle-pill-on-expense" : "")}>
          <TrendingDown size={14} /> 支出
        </button>
      </div>

      <label className="field-label">
        分店
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="ledger-input">
          {STORES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="field-label">
          日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ledger-input" required />
        </label>
        <label className="field-label">
          付款方式
          <select value={payment} onChange={(e) => setPayment(e.target.value)} className="ledger-input">
            {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>

      <div className="field-label">
        分類與金額（可以加多個，例如剪髮同時順便買產品）
        <CategoryLineEditor rows={rows} categories={categories} type={type} materials={materials} onChange={setRows} />
      </div>

      {type === "income" && staff.length > 0 && (
        <label className="field-label">
          服務員工（選填，用於計算抽成）
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="ledger-input">
            <option value="">— 不指定 —</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      <label className="field-label">
        備註
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="ledger-input" placeholder="例如：客人姓名、品項細節" />
      </label>

      {error && <div style={{ color: WINE, fontSize: 13 }}>{error}</div>}

      <button type="submit" className="ledger-btn ledger-btn-primary" style={{ justifyContent: "center" }}>
        <Plus size={15} /> 新增這筆
      </button>
    </form>
  );
}

function GroupRow({ g, staff, onDelete }) {
  const s = staff.find((x) => x.id === g.staffId);
  const isIncome = g.type === "income";
  const label = g.items.map((i) => i.category).join("、");
  return (
    <div className="ledger-row">
      <div style={{ width: 78, color: MUTED, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>{g.date.slice(5)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: INK, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{label}{s ? " · " + s.name : ""}</span>
          {g.storeId ? (
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: BRASS_LIGHT, color: BRASS, fontWeight: 600 }}>
              {storeName(g.storeId)}
            </span>
          ) : (
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: "#EFEDE7", color: MUTED }}>
              未指定分店
            </span>
          )}
        </div>
        {g.items.length > 1 && (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
            {g.items.map((i) => i.category + " " + fmtMoney(i.amount)).join("　")}
          </div>
        )}
        {g.note && <div style={{ fontSize: 12, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.note}</div>}
      </div>
      <div style={{ width: 62, fontSize: 11, color: MUTED, textAlign: "center" }}>{g.paymentMethod}</div>
      <div style={{
        width: 100, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
        fontSize: 14, color: isIncome ? SAGE : WINE, fontVariantNumeric: "tabular-nums",
      }}>
        {isIncome ? "+" : "-"}{fmtMoney(g.amount).replace("NT$", "")}
      </div>
      <ConfirmDelete onConfirm={() => onDelete(g.groupId)} />
    </div>
  );
}

function LedgerView({ transactions, staff, materials, defaultStoreId, onAdd, onDelete }) {
  const [filterType, setFilterType] = useState("all");
  const [filterMonth, setFilterMonth] = useState(monthKey(todayStr()));

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => (filterType === "all" ? true : t.type === filterType))
      .filter((t) => monthKey(t.date) === filterMonth)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [transactions, filterType, filterMonth]);

  const grouped = useMemo(() => groupTx(filtered), [filtered]);

  const availableMonths = useMemo(() => {
    const set = new Set(transactions.map((t) => monthKey(t.date)));
    set.add(monthKey(todayStr()));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20 }} className="responsive-grid">
      <TxForm onAdd={onAdd} staff={staff} materials={materials} defaultStoreId={defaultStoreId} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="ledger-input" style={{ width: 130 }}>
            {availableMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            {[["all", "全部"], ["income", "收入"], ["expense", "支出"]].map(([v, l]) => (
              <button key={v} onClick={() => setFilterType(v)} className={"chip" + (filterType === v ? " chip-on" : "")}>{l}</button>
            ))}
          </div>
          <div style={{ marginLeft: "auto", fontSize: 12, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>共 {grouped.length} 筆</div>
        </div>

        <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, overflow: "hidden" }}>
          {grouped.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 13 }}>這個月還沒有記錄，開始記第一筆吧。</div>
          ) : (
            grouped.map((g) => <GroupRow key={g.groupId} g={g} staff={staff} onDelete={onDelete} />)
          )}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ transactions, allTransactions, staff, storeFilter }) {
  const mk = monthKey(todayStr());
  const monthTx = transactions.filter((t) => monthKey(t.date) === mk);
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = income - expense;
  const allTimeNet = transactions.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);

  const trend = useMemo(() => {
    return last6Months(mk).map((m) => {
      const tx = transactions.filter((t) => monthKey(t.date) === m);
      return {
        month: m.slice(5) + "月",
        收入: tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
        支出: tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [transactions, mk]);

  // 選「全部分店」時，把本月各店的數字拆開來看
  const perStore = useMemo(() => {
    if (storeFilter !== ALL_STORES) return null;
    const src = allTransactions || transactions;
    const rows = STORES.map((st) => {
      const tx = src.filter((t) => t.storeId === st.id && monthKey(t.date) === mk);
      const inc = tx.filter((t) => t.type === "income").reduce((s2, t) => s2 + t.amount, 0);
      const exp = tx.filter((t) => t.type === "expense").reduce((s2, t) => s2 + t.amount, 0);
      return { id: st.id, name: st.name, income: inc, expense: exp, net: inc - exp };
    });
    const un = src.filter((t) => !t.storeId && monthKey(t.date) === mk);
    if (un.length > 0) {
      const inc = un.filter((t) => t.type === "income").reduce((s2, t) => s2 + t.amount, 0);
      const exp = un.filter((t) => t.type === "expense").reduce((s2, t) => s2 + t.amount, 0);
      rows.push({ id: NO_STORE, name: "未指定分店", income: inc, expense: exp, net: inc - exp, muted: true });
    }
    return rows;
  }, [allTransactions, transactions, storeFilter, mk]);

  const recent = groupTx([...transactions].sort((a, b) => (a.date < b.date ? 1 : -1))).slice(0, 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{
        background: INK, borderRadius: 10, padding: "20px 24px", color: PAPER,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
        clipPath: "polygon(0 0, 100% 0, 100% 94%, 98% 100%, 95% 94%, 92% 100%, 89% 94%, 86% 100%, 83% 94%, 80% 100%, 77% 94%, 74% 100%, 71% 94%, 68% 100%, 65% 94%, 62% 100%, 59% 94%, 56% 100%, 53% 94%, 50% 100%, 47% 94%, 44% 100%, 41% 94%, 38% 100%, 35% 94%, 32% 100%, 29% 94%, 26% 100%, 23% 94%, 20% 100%, 17% 94%, 14% 100%, 11% 94%, 8% 100%, 5% 94%, 2% 100%, 0 94%)",
        paddingBottom: 30,
      }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.08em", color: "#C9BFA6", fontFamily: "'IBM Plex Sans', sans-serif" }}>累積結餘 · TOTAL BALANCE</div>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 32, letterSpacing: "0.02em",
            color: allTimeNet >= 0 ? "#B9D6B0" : "#E3B3AC", marginTop: 4,
          }}>{fmtMoney(allTimeNet)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#C9BFA6", fontFamily: "'IBM Plex Sans', sans-serif" }}>{monthLabel(mk)} 淨利</div>
          <div style={{
            fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 22,
            color: net >= 0 ? "#B9D6B0" : "#E3B3AC",
          }}>{fmtSigned(net)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <StatCard label={monthLabel(mk) + " 收入"} value={fmtMoney(income)} tone="income" icon={<TrendingUp size={15} />} />
        <StatCard label={monthLabel(mk) + " 支出"} value={fmtMoney(expense)} tone="expense" icon={<TrendingDown size={15} />} />
        <StatCard label="本月交易筆數" value={monthTx.length} icon={<Receipt size={15} />} />
        <StatCard label="在職員工" value={staff.length} icon={<Users size={15} />} />
      </div>

      {perStore && (
        <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 18 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, marginBottom: 4, color: INK }}>
            {monthLabel(mk)} 各分店
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>
            上方選單切到單一分店，所有頁面就只會顯示那家店的數字。
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {perStore.map((r) => (
              <div key={r.id} style={{
                border: "1px solid " + PAPER_LINE, borderRadius: 9, padding: "13px 15px",
                background: "#FFFDF8", opacity: r.muted ? 0.7 : 1,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: r.muted ? MUTED : INK, marginBottom: 8 }}>{r.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, padding: "2px 0" }}>
                  <span>收入</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: SAGE }}>{fmtMoney(r.income)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MUTED, padding: "2px 0" }}>
                  <span>支出</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: WINE }}>{fmtMoney(r.expense)}</span>
                </div>
                <div style={{
                  display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600,
                  paddingTop: 7, marginTop: 5, borderTop: "1px dashed " + PAPER_LINE, color: INK,
                }}>
                  <span>淨額</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: r.net >= 0 ? SAGE : WINE }}>
                    {fmtMoney(r.net)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 18 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, marginBottom: 12, color: INK }}>近六個月收支趨勢</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={PAPER_LINE} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: MUTED, fontFamily: "IBM Plex Sans" }} axisLine={{ stroke: PAPER_LINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: MUTED, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 8, fontSize: 12, fontFamily: "IBM Plex Sans" }} formatter={(v) => fmtMoney(v)} />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans" }} />
              <Bar dataKey="收入" fill={SAGE} radius={[3, 3, 0, 0]} />
              <Bar dataKey="支出" fill={WINE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, padding: "16px 18px 8px", color: INK }}>最近記錄</div>
        {recent.length === 0 ? (
          <div style={{ padding: "8px 18px 24px", color: MUTED, fontSize: 13 }}>還沒有任何記錄。</div>
        ) : recent.map((g) => <GroupRow key={g.groupId} g={g} staff={staff} onDelete={() => {}} />)}
      </div>
    </div>
  );
}

function staffCategory(s) {
  return s.category || (s.commissionRate > 0 ? "designer" : "assistant");
}

function StaffEditForm({ category, editingStaff, onSave, onCancel }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [rate, setRate] = useState("");
  const [base, setBase] = useState("");
  const [materialRate, setMaterialRate] = useState(String(DEFAULT_MATERIAL_RATE));

  useEffect(() => {
    if (editingStaff) {
      setName(editingStaff.name); setRole(editingStaff.role || "");
      setRate(String(editingStaff.commissionRate || "")); setBase(String(editingStaff.baseSalary || ""));
      setMaterialRate(String(editingStaff.defaultMaterialRate ?? DEFAULT_MATERIAL_RATE));
    } else {
      setName(""); setRole(""); setRate(""); setBase(""); setMaterialRate(String(DEFAULT_MATERIAL_RATE));
    }
  }, [editingStaff, category]);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(), role: role.trim(), category, baseSalary: parseFloat(base) || 0,
      commissionRate: category === "designer" ? (parseFloat(rate) || 0) : 0,
      defaultMaterialRate: category === "designer" ? (parseFloat(materialRate) || 0) : 0,
    };
    onSave(payload);
    if (!editingStaff) { setName(""); setRole(""); setRate(""); setBase(""); setMaterialRate(String(DEFAULT_MATERIAL_RATE)); }
  }

  return (
    <form onSubmit={submit} style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10, height: "fit-content" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: INK }}>
        {editingStaff ? "編輯" : "新增"}{category === "designer" ? "設計師" : "助理"}
      </div>
      <label className="field-label">姓名<input className="ledger-input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="field-label">職稱（選填）<input className="ledger-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder={category === "designer" ? "設計師 / 資深設計師" : "助理 / 實習助理"} /></label>
      <label className="field-label">底薪 (NT$)<input className="ledger-input" type="number" min="0" value={base} onChange={(e) => setBase(e.target.value)} placeholder="0" /></label>
      {category === "designer" && (
        <>
          <label className="field-label">抽成比例 (%)<input className="ledger-input" type="number" min="0" max="100" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" /></label>
          <label className="field-label">
            基本物料費比例 (%)
            <input className="ledger-input" type="number" min="0" max="100" value={materialRate} onChange={(e) => setMaterialRate(e.target.value)} placeholder="10" />
          </label>
          <div style={{ fontSize: 11, color: MUTED, marginTop: -4 }}>結算時會先從業績扣掉這個比例當作基本物料，剩下的淨業績才乘上抽成比例，例如業績 × (1－{materialRate || 10}%) × 抽成%。之後有代購等其他扣款可以在結算時另外加。</div>
        </>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="ledger-btn ledger-btn-primary" style={{ flex: 1, justifyContent: "center" }}>{editingStaff ? "儲存" : "新增"}</button>
        {editingStaff && <button type="button" className="ledger-btn" onClick={onCancel}>取消</button>}
      </div>
    </form>
  );
}

function AssistantItemsEditor({ items, templates, onChange, onAddTemplate, onRemoveTemplate }) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTemplate, setNewTemplate] = useState("");

  function addItem(name) {
    onChange([...items, { id: uid(), name: name || "", amount: 0, kind: "add" }]);
  }
  function updateItem(id, patch) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function removeItem(id) {
    onChange(items.filter((i) => i.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button type="button" className={"chip" + (it.kind === "add" ? " chip-on" : "")} style={{ flexShrink: 0, minWidth: 44 }} onClick={() => updateItem(it.id, { kind: it.kind === "add" ? "deduct" : "add" })}>
            {it.kind === "add" ? "＋加項" : "－扣項"}
          </button>
          <input className="ledger-input" style={{ flex: 1 }} placeholder="項目名稱" value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} />
          <input className="ledger-input" style={{ width: 90 }} type="number" min="0" value={it.amount} onChange={(e) => updateItem(it.id, { amount: parseFloat(e.target.value) || 0 })} />
          <button type="button" className="ledger-icon-btn" onClick={() => removeItem(it.id)} aria-label="移除"><X size={14} /></button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="ledger-btn" style={{ fontSize: 12 }} onClick={() => addItem("")}><Plus size={13} /> 自訂項目</button>
        <button type="button" className="chip" onClick={() => setShowTemplates((v) => !v)}>{showTemplates ? "收合範本" : "從範本選"}</button>
      </div>
      {showTemplates && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, background: PAPER, borderRadius: 8, padding: 10 }}>
          {templates.map((t) => (
            <span key={t} className="tpl-chip">
              <span onClick={() => addItem(t)}>{t}</span>
              <X size={11} style={{ cursor: "pointer" }} onClick={() => onRemoveTemplate(t)} />
            </span>
          ))}
          <input
            className="ledger-input" style={{ width: 120 }} placeholder="新增範本項目"
            value={newTemplate} onChange={(e) => setNewTemplate(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newTemplate.trim()) { e.preventDefault(); onAddTemplate(newTemplate.trim()); setNewTemplate(""); } }}
          />
        </div>
      )}
    </div>
  );
}

function AssistantCard({ s, items, templates, onChangeItems, onAddTemplate, onRemoveTemplate, onEdit, onDelete, onSettle, alreadySettled }) {
  const addTotal = items.filter((i) => i.kind === "add").reduce((sum, i) => sum + i.amount, 0);
  const deductTotal = items.filter((i) => i.kind === "deduct").reduce((sum, i) => sum + i.amount, 0);
  const payable = s.baseSalary + addTotal - deductTotal;
  return (
    <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, color: INK }}>{s.name}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{s.role || "助理"} · 底薪 {fmtMoney(s.baseSalary)}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="ledger-icon-btn" onClick={() => onEdit(s)} aria-label="編輯"><Pencil size={14} /></button>
          <ConfirmDelete onConfirm={() => onDelete(s.id)} />
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>本月加項 / 扣款項目</div>
        <AssistantItemsEditor items={items} templates={templates} onChange={onChangeItems} onAddTemplate={onAddTemplate} onRemoveTemplate={onRemoveTemplate} />
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: MUTED }}>底薪 {fmtMoney(s.baseSalary)} ＋ 加項 {fmtMoney(addTotal)} － 扣項 {fmtMoney(deductTotal)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 16, color: INK }}>本月應付 {fmtMoney(payable)}</div>
          <button className="ledger-btn" disabled={alreadySettled || payable <= 0} onClick={() => onSettle(s, payable)} style={{ fontSize: 12, opacity: alreadySettled || payable <= 0 ? 0.5 : 1 }}>
            {alreadySettled ? <><Check size={13} /> 已結算</> : "建立薪資支出"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DesignerDeductionsEditor({ items, onChange }) {
  function addItem() {
    onChange([...items, { id: uid(), name: "", type: "fixed", value: 0 }]);
  }
  function updateItem(id, patch) {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function removeItem(id) {
    onChange(items.filter((i) => i.id !== id));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((it) => (
        <div key={it.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input className="ledger-input" style={{ flex: 1 }} placeholder="扣款項目名稱" value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} />
          <button type="button" className="chip chip-on" style={{ flexShrink: 0, minWidth: 60 }} onClick={() => updateItem(it.id, { type: it.type === "percent" ? "fixed" : "percent" })}>
            {it.type === "percent" ? "比例%" : "金額$"}
          </button>
          <input className="ledger-input" style={{ width: 90 }} type="number" min="0" value={it.value} onChange={(e) => updateItem(it.id, { value: parseFloat(e.target.value) || 0 })} />
          <button type="button" className="ledger-icon-btn" onClick={() => removeItem(it.id)} aria-label="移除"><X size={14} /></button>
        </div>
      ))}
      <button type="button" className="ledger-btn" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={addItem}><Plus size={13} /> 新增扣款項目</button>
    </div>
  );
}

function DesignerCard({ s, transactions, deductions, onChangeDeductions, onEdit, onDelete, onSettle, alreadySettled }) {
  const mk = monthKey(todayStr());
  const commissionTx = transactions.filter((t) => t.type === "income" && t.staffId === s.id && monthKey(t.date) === mk);
  const revenue = commissionTx.reduce((sum, t) => sum + t.amount, 0);
  const materialRate = s.defaultMaterialRate ?? DEFAULT_MATERIAL_RATE;
  const baseMaterial = revenue * (materialRate / 100);
  const netRevenue = revenue - baseMaterial;
  const commission = netRevenue * (s.commissionRate / 100);

  const otherDeductionTotal = deductions.reduce((sum, d) => sum + (d.type === "percent" ? revenue * (d.value / 100) : d.value), 0);
  const payable = s.baseSalary + commission - otherDeductionTotal;

  return (
    <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 16, color: INK }}>{s.name}</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{s.role || "設計師"} · 抽成 {s.commissionRate}% · 基本物料 {materialRate}% · 底薪 {fmtMoney(s.baseSalary)}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="ledger-icon-btn" onClick={() => onEdit(s)} aria-label="編輯"><Pencil size={14} /></button>
          <ConfirmDelete onConfirm={() => onDelete(s.id)} />
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE, fontSize: 13, color: MUTED, display: "flex", flexDirection: "column", gap: 2 }}>
        <div>{monthLabel(mk)}業績 {fmtMoney(revenue)} － 基本物料 {materialRate}%（{fmtMoney(baseMaterial)}）＝ {fmtMoney(netRevenue)}</div>
        <div>抽成 {fmtMoney(netRevenue)} × {s.commissionRate}% ＝ {fmtMoney(commission)}</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>其他扣款（代購、賠償等，從應付薪資中再扣除；基本物料已內含在抽成計算中，不用重複列在這裡）</div>
        <DesignerDeductionsEditor items={deductions} onChange={onChangeDeductions} />
      </div>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: MUTED }}>底薪 {fmtMoney(s.baseSalary)} ＋ 抽成 {fmtMoney(commission)} － 其他扣款 {fmtMoney(otherDeductionTotal)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 16, color: INK }}>本月應付 {fmtMoney(payable)}</div>
          <button className="ledger-btn" disabled={alreadySettled || payable <= 0} onClick={() => onSettle(s, payable)} style={{ fontSize: 12, opacity: alreadySettled || payable <= 0 ? 0.5 : 1 }}>
            {alreadySettled ? <><Check size={13} /> 已結算</> : "建立薪資支出"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffView({
  staff, transactions, assistantItems, designerDeductions, templates,
  onAdd, onUpdate, onDelete, onSettle,
  onChangeAssistantItems, onChangeDesignerDeductions, onAddTemplate, onRemoveTemplate,
}) {
  const [category, setCategory] = useState("designer");
  const [editingId, setEditingId] = useState(null);
  const mk = monthKey(todayStr());

  const list = staff.filter((s) => staffCategory(s) === category);
  const editingStaff = editingId ? staff.find((s) => s.id === editingId) : null;

  function saveStaff(payload) {
    if (editingId) { onUpdate(editingId, payload); setEditingId(null); }
    else onAdd({ id: uid(), ...payload });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {[["designer", "設計師"], ["assistant", "助理"]].map(([v, l]) => (
          <button key={v} className={"chip" + (category === v ? " chip-on" : "")} onClick={() => { setCategory(v); setEditingId(null); }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }} className="responsive-grid">
        <StaffEditForm category={category} editingStaff={editingStaff} onSave={saveStaff} onCancel={() => setEditingId(null)} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: 20 }}>還沒有{category === "designer" ? "設計師" : "助理"}資料，先在左邊新增一位吧。</div>}
          {list.map((s) => {
            const settledNote = "薪資結算：" + s.name + " " + mk;
            const alreadySettled = transactions.some((t) => t.type === "expense" && t.note === settledNote);
            const handleSettle = (staffObj, payable) => onSettle(staffObj, payable, settledNote);
            if (category === "assistant") {
              const items = assistantItems.filter((i) => i.staffId === s.id && i.month === mk);
              return (
                <AssistantCard
                  key={s.id} s={s} items={items} templates={templates}
                  onChangeItems={(next) => onChangeAssistantItems(s.id, mk, next)}
                  onAddTemplate={onAddTemplate} onRemoveTemplate={onRemoveTemplate}
                  onEdit={() => setEditingId(s.id)} onDelete={onDelete}
                  onSettle={handleSettle} alreadySettled={alreadySettled}
                />
              );
            }
            const deductions = designerDeductions.filter((d) => d.staffId === s.id && d.month === mk);
            return (
              <DesignerCard
                key={s.id} s={s} transactions={transactions} deductions={deductions}
                onChangeDeductions={(next) => onChangeDesignerDeductions(s.id, mk, next)}
                onEdit={() => setEditingId(s.id)} onDelete={onDelete}
                onSettle={handleSettle} alreadySettled={alreadySettled}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DailyClosingView({ transactions, closings, storeFilter, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [storeId, setStoreId] = useState(
    storeFilter && storeFilter !== ALL_STORES && storeFilter !== NO_STORE ? storeFilter : STORES[0].id
  );
  const [opening, setOpening] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");

  const dayTx = transactions.filter((t) => t.date === date && (t.storeId || "") === storeId);
  const cashIn = dayTx.filter((t) => t.type === "income" && t.paymentMethod === "現金").reduce((s, t) => s + t.amount, 0);
  const cashOut = dayTx.filter((t) => t.type === "expense" && t.paymentMethod === "現金").reduce((s, t) => s + t.amount, 0);
  const totalIncome = dayTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = dayTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const openingNum = parseFloat(opening) || 0;
  const expectedCash = openingNum + cashIn - cashOut;
  const countedNum = parseFloat(counted) || 0;
  const diff = counted === "" ? null : countedNum - expectedCash;

  const existing = closings.find((c) => c.date === date && (c.storeId || STORES[0].id) === storeId);

  useEffect(() => {
    if (existing) {
      setOpening(String(existing.openingCash));
      setCounted(String(existing.closingCashCounted));
      setNote(existing.note || "");
    } else {
      setOpening(""); setCounted(""); setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, storeId]);

  useEffect(() => {
    if (storeFilter && storeFilter !== ALL_STORES && storeFilter !== NO_STORE) setStoreId(storeFilter);
  }, [storeFilter]);

  function save() {
    onSave({
      id: existing ? existing.id : uid(), date, storeId,
      openingCash: openingNum, closingCashCounted: countedNum,
      expectedCash, note: note.trim(),
    });
  }

  const sortedClosings = [...closings].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20 }} className="responsive-grid">
      <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <label className="field-label">日期<input type="date" className="ledger-input" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="field-label">分店
          <select className="ledger-input" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {STORES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: MUTED, background: PAPER, borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>當日收入</span><span style={{ fontFamily: "IBM Plex Mono", color: SAGE }}>{fmtMoney(totalIncome)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>當日支出</span><span style={{ fontFamily: "IBM Plex Mono", color: WINE }}>{fmtMoney(totalExpense)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>現金收入</span><span style={{ fontFamily: "IBM Plex Mono" }}>{fmtMoney(cashIn)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span>現金支出</span><span style={{ fontFamily: "IBM Plex Mono" }}>{fmtMoney(cashOut)}</span></div>
        </div>

        <label className="field-label">今日開店現金（零用金）<input type="number" className="ledger-input" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0" /></label>

        <div style={{ fontSize: 13, color: MUTED, display: "flex", justifyContent: "space-between", padding: "0 2px" }}>
          <span>系統預估應有現金</span>
          <span style={{ fontFamily: "IBM Plex Mono", fontWeight: 600, color: INK }}>{fmtMoney(expectedCash)}</span>
        </div>

        <label className="field-label">實際清點現金<input type="number" className="ledger-input" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" /></label>

        {diff !== null && (
          <div style={{
            fontSize: 13, padding: "8px 12px", borderRadius: 8,
            background: diff === 0 ? SAGE_LIGHT : WINE_LIGHT, color: diff === 0 ? SAGE : WINE, fontWeight: 500,
          }}>
            {diff === 0 ? "帳款相符" : diff > 0 ? "現金多出 " + fmtMoney(diff) : "現金短少 " + fmtMoney(Math.abs(diff))}
          </div>
        )}

        <label className="field-label">備註<input className="ledger-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：找零不足、代墊款項" /></label>

        <button className="ledger-btn ledger-btn-primary" style={{ justifyContent: "center" }} onClick={save}>
          <CalendarCheck size={15} /> {existing ? "更新結帳紀錄" : "儲存結帳紀錄"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: INK }}>近期結帳紀錄</div>
        {sortedClosings.length === 0 ? (
          <div style={{ color: MUTED, fontSize: 13 }}>還沒有結帳紀錄。</div>
        ) : (
          <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, overflow: "hidden" }}>
            {sortedClosings.map((c) => {
              const d = c.closingCashCounted - c.expectedCash;
              return (
                <div key={c.id} className="ledger-row" style={{ cursor: "pointer" }} onClick={() => setDate(c.date)}>
                  <div style={{ width: 90, fontFamily: "IBM Plex Mono", fontSize: 12, color: MUTED }}>{c.date}</div>
                  <div style={{ flex: 1, fontSize: 13, color: INK }}>應有 {fmtMoney(c.expectedCash)} · 實際 {fmtMoney(c.closingCashCounted)}</div>
                  <div style={{ fontFamily: "IBM Plex Mono", fontSize: 13, fontWeight: 600, color: d === 0 ? SAGE : WINE }}>
                    {d === 0 ? "相符" : (d > 0 ? "+" : "") + fmtMoney(d)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const PIE_COLORS = [BRASS, SAGE, WINE, "#6B5B95", "#4C7C8C", MUTED];

function ReportsView({ transactions, allTransactions, storeFilter }) {
  const [mk, setMk] = useState(monthKey(todayStr()));
  const monthTx = transactions.filter((t) => monthKey(t.date) === mk);
  const income = monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const incomeByCat = useMemo(() => {
    const map = {};
    monthTx.filter((t) => t.type === "income").forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const expenseByCat = useMemo(() => {
    const map = {};
    monthTx.filter((t) => t.type === "expense").forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const trend = useMemo(() => {
    return last6Months(mk).map((m) => {
      const tx = transactions.filter((t) => monthKey(t.date) === m);
      const inc = tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const exp = tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      return { month: m.slice(5) + "月", 淨利: inc - exp };
    });
  }, [transactions, mk]);

  const sortedTx = groupTx([...monthTx].sort((a, b) => (a.date < b.date ? 1 : -1)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button className="ledger-icon-btn" onClick={() => setMk(addMonths(mk, -1))} aria-label="上個月"><ChevronLeft size={16} /></button>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: INK, minWidth: 100, textAlign: "center" }}>{monthLabel(mk)}</div>
        <button className="ledger-icon-btn" onClick={() => setMk(addMonths(mk, 1))} aria-label="下個月"><ChevronRight size={16} /></button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 20, fontSize: 13, color: MUTED }}>
          <span>收入 <b style={{ color: SAGE, fontFamily: "IBM Plex Mono" }}>{fmtMoney(income)}</b></span>
          <span>支出 <b style={{ color: WINE, fontFamily: "IBM Plex Mono" }}>{fmtMoney(expense)}</b></span>
          <span>淨利 <b style={{ color: INK, fontFamily: "IBM Plex Mono" }}>{fmtSigned(income - expense)}</b></span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="responsive-grid">
        <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: INK, marginBottom: 8 }}>收入分類佔比</div>
          {incomeByCat.length === 0 ? <div style={{ color: MUTED, fontSize: 13, padding: 20 }}>本月尚無收入</div> : (
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={incomeByCat} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {incomeByCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans", border: "1px solid " + PAPER_LINE, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Sans" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: INK, marginBottom: 8 }}>支出分類佔比</div>
          {expenseByCat.length === 0 ? <div style={{ color: MUTED, fontSize: 13, padding: 20 }}>本月尚無支出</div> : (
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expenseByCat} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {expenseByCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans", border: "1px solid " + PAPER_LINE, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Sans" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: INK, marginBottom: 8 }}>近六個月淨利趨勢</div>
        <div style={{ height: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke={PAPER_LINE} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: MUTED, fontFamily: "IBM Plex Sans" }} axisLine={{ stroke: PAPER_LINE }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: MUTED, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={50} />
              <Tooltip formatter={(v) => fmtMoney(v)} contentStyle={{ fontSize: 12, fontFamily: "IBM Plex Sans", border: "1px solid " + PAPER_LINE, borderRadius: 8 }} />
              <Line type="monotone" dataKey="淨利" stroke={BRASS_DARK} strokeWidth={2.5} dot={{ r: 3, fill: BRASS_DARK }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: INK, padding: "14px 18px 6px" }}>本月收支明細</div>
        {sortedTx.length === 0 ? (
          <div style={{ padding: "8px 18px 24px", color: MUTED, fontSize: 13 }}>本月尚無交易紀錄。</div>
        ) : sortedTx.map((g) => <GroupRow key={g.groupId} g={g} staff={[]} onDelete={() => {}} />)}
      </div>
    </div>
  );
}

function MaterialForm({ editing, onSave, onCancel }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [stock, setStock] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name); setUnit(editing.unit || "");
      setStock(String(editing.stock ?? "")); setCost(String(editing.costPerUnit ?? ""));
    } else {
      setName(""); setUnit(""); setStock(""); setCost("");
    }
  }, [editing]);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), unit: unit.trim() || "個", stock: parseFloat(stock) || 0, costPerUnit: parseFloat(cost) || 0 });
    if (!editing) { setName(""); setUnit(""); setStock(""); setCost(""); }
  }

  return (
    <form onSubmit={submit} style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10, height: "fit-content" }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: INK }}>{editing ? "編輯物料" : "新增物料"}</div>
      <label className="field-label">名稱<input className="ledger-input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
      <label className="field-label">單位<input className="ledger-input" placeholder="瓶 / 罐 / 份" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
      <label className="field-label">目前庫存量<input className="ledger-input" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" /></label>
      <label className="field-label">單位成本 (NT$，選填)<input className="ledger-input" type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" /></label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="ledger-btn ledger-btn-primary" style={{ flex: 1, justifyContent: "center" }}>{editing ? "儲存" : "新增"}</button>
        {editing && <button type="button" className="ledger-btn" onClick={onCancel}>取消</button>}
      </div>
    </form>
  );
}

function MaterialsView({ materials, onAdd, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);
  const editing = editingId ? materials.find((m) => m.id === editingId) : null;

  function save(payload) {
    if (editingId) { onUpdate(editingId, payload); setEditingId(null); }
    else onAdd({ id: uid(), ...payload });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }} className="responsive-grid">
      <MaterialForm editing={editing} onSave={save} onCancel={() => setEditingId(null)} />
      <div style={{ background: PAPER_RAISED, border: "1px solid " + PAPER_LINE, borderRadius: 10, overflow: "hidden" }}>
        {materials.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: MUTED, fontSize: 13 }}>
            還沒有物料資料，先在左邊新增一項。之後在記帳選「產品銷售」時，就能選對應的物料自動扣庫存。
          </div>
        ) : materials.map((m) => (
          <div key={m.id} className="ledger-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: INK }}>{m.name}</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>單位 {m.unit}{m.costPerUnit > 0 ? " · 成本 " + fmtMoney(m.costPerUnit) : ""}</div>
            </div>
            <div style={{ width: 90, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 15, color: m.stock <= 5 ? WINE : INK }}>
              {m.stock} {m.unit}
            </div>
            <button className="ledger-icon-btn" onClick={() => setEditingId(m.id)} aria-label="編輯"><Pencil size={14} /></button>
            <ConfirmDelete onConfirm={() => onDelete(m.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { id: "dashboard", label: "總覽", icon: Wallet },
  { id: "ledger", label: "記帳", icon: Receipt },
  { id: "materials", label: "物料", icon: Package },
  { id: "staff", label: "員工薪資", icon: Users },
  { id: "closing", label: "每日結帳", icon: CalendarCheck },
  { id: "reports", label: "報表", icon: BarChart3 },
];

export default function FinanceApp() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [storeFilter, setStoreFilter] = useState(ALL_STORES);
  const [transactions, setTransactions] = useState([]);
  const [staff, setStaff] = useState([]);
  const [closings, setClosings] = useState([]);
  const [assistantItems, setAssistantItems] = useState([]);
  const [designerDeductions, setDesignerDeductions] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_ASSISTANT_TEMPLATES);
  const [materials, setMaterials] = useState([]);

  useEffect(() => {
    (async () => {
      const [tx, st, cl, ai, dd, tpl, mat] = await Promise.all([
        loadKey(TX_KEY, []), loadKey(STAFF_KEY, []), loadKey(CLOSING_KEY, []),
        loadKey(ASSISTANT_ITEMS_KEY, []), loadKey(DESIGNER_DEDUCTIONS_KEY, []),
        loadKey(ITEM_TEMPLATES_KEY, DEFAULT_ASSISTANT_TEMPLATES), loadKey(MATERIALS_KEY, []),
      ]);
      setTransactions(tx); setStaff(st); setClosings(cl);
      setAssistantItems(ai); setDesignerDeductions(dd); setTemplates(tpl); setMaterials(mat);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveKey(TX_KEY, transactions); }, [transactions, loaded]);
  useEffect(() => { if (loaded) saveKey(STAFF_KEY, staff); }, [staff, loaded]);
  useEffect(() => { if (loaded) saveKey(CLOSING_KEY, closings); }, [closings, loaded]);
  useEffect(() => { if (loaded) saveKey(ASSISTANT_ITEMS_KEY, assistantItems); }, [assistantItems, loaded]);
  useEffect(() => { if (loaded) saveKey(DESIGNER_DEDUCTIONS_KEY, designerDeductions); }, [designerDeductions, loaded]);
  useEffect(() => { if (loaded) saveKey(ITEM_TEMPLATES_KEY, templates); }, [templates, loaded]);
  useEffect(() => { if (loaded) saveKey(MATERIALS_KEY, materials); }, [materials, loaded]);

  const addTx = useCallback((tx) => setTransactions((prev) => [tx, ...prev]), []);
  const deleteTx = useCallback((id) => setTransactions((prev) => prev.filter((t) => t.id !== id)), []);
  const visibleTx = useMemo(() => filterByStore(transactions, storeFilter), [transactions, storeFilter]);
  const activeStoreId = storeFilter === ALL_STORES || storeFilter === NO_STORE ? STORES[0].id : storeFilter;

  const addTxGroup = useCallback((rows, meta) => {
    const groupId = uid();
    const txs = rows.map((r) => ({
      id: uid(), groupId, type: meta.type, date: meta.date, category: r.category, amount: r.amount,
      note: meta.note, paymentMethod: meta.paymentMethod, staffId: meta.staffId,
      storeId: meta.storeId || "",
    }));
    setTransactions((prev) => [...txs, ...prev]);
    const used = rows.filter((r) => r.materialId && r.qty > 0);
    if (used.length > 0) {
      setMaterials((prev) => prev.map((m) => {
        const qty = used.filter((u) => u.materialId === m.id).reduce((sum, u) => sum + u.qty, 0);
        return qty > 0 ? { ...m, stock: Math.max(0, m.stock - qty) } : m;
      }));
    }
  }, []);
  const deleteTxGroup = useCallback((groupId) => {
    setTransactions((prev) => prev.filter((t) => (t.groupId || t.id) !== groupId));
  }, []);
  const addStaff = useCallback((s) => setStaff((prev) => [...prev, s]), []);
  const updateStaff = useCallback((id, patch) => setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s))), []);
  const deleteStaff = useCallback((id) => setStaff((prev) => prev.filter((s) => s.id !== id)), []);
  const addMaterial = useCallback((m) => setMaterials((prev) => [...prev, m]), []);
  const updateMaterial = useCallback((id, patch) => setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m))), []);
  const deleteMaterial = useCallback((id) => setMaterials((prev) => prev.filter((m) => m.id !== id)), []);
  const settleStaff = useCallback((s, amount, note) => {
    addTx({ id: uid(), type: "expense", date: todayStr(), category: "員工薪資", amount, note, paymentMethod: "銀行轉帳", staffId: null });
  }, [addTx]);
  const changeAssistantItems = useCallback((staffId, month, nextItems) => {
    setAssistantItems((prev) => {
      const rest = prev.filter((i) => !(i.staffId === staffId && i.month === month));
      return [...rest, ...nextItems.map((i) => ({ ...i, staffId, month }))];
    });
  }, []);
  const changeDesignerDeductions = useCallback((staffId, month, nextItems) => {
    setDesignerDeductions((prev) => {
      const rest = prev.filter((i) => !(i.staffId === staffId && i.month === month));
      return [...rest, ...nextItems.map((i) => ({ ...i, staffId, month }))];
    });
  }, []);
  const addTemplate = useCallback((name) => setTemplates((prev) => (prev.includes(name) ? prev : [...prev, name])), []);
  const removeTemplate = useCallback((name) => setTemplates((prev) => prev.filter((t) => t !== name)), []);
  const saveClosing = useCallback((c) => {
    const same = (x) => x.date === c.date && (x.storeId || STORES[0].id) === (c.storeId || STORES[0].id);
    setClosings((prev) => {
      if (prev.some(same)) return prev.map((x) => (same(x) ? c : x));
      return [c, ...prev];
    });
  }, []);

  if (!loaded) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: MUTED, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        帳本載入中…
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', sans-serif", background: PAPER, color: INK,
      minHeight: "100vh", padding: "0 0 60px",
    }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        .field-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: ${MUTED}; }
        .ledger-input {
          font-family: 'IBM Plex Sans', sans-serif; font-size: 14px; color: ${INK};
          background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 6px;
          padding: 8px 10px; outline: none; width: 100%;
        }
        .ledger-input:focus { border-color: ${BRASS}; box-shadow: 0 0 0 2px rgba(169,129,47,0.15); }
        .ledger-btn {
          display: inline-flex; align-items: center; gap: 6px; font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px; font-weight: 500; color: ${INK}; background: #FFFDF8;
          border: 1px solid ${PAPER_LINE}; border-radius: 6px; padding: 8px 14px; cursor: pointer;
        }
        .ledger-btn:hover { border-color: ${BRASS}; }
        .ledger-btn:disabled { cursor: not-allowed; }
        .ledger-btn-primary { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .ledger-btn-primary:hover { background: #3A322A; }
        .ledger-btn-danger { background: ${WINE}; color: white; border-color: ${WINE}; }
        .ledger-icon-btn {
          display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px;
          border-radius: 6px; border: 1px solid transparent; background: transparent; color: ${MUTED}; cursor: pointer;
        }
        .ledger-icon-btn:hover { background: ${PAPER}; color: ${INK}; }
        .toggle-pill {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 500; padding: 8px 0;
          border-radius: 6px; border: 1px solid ${PAPER_LINE}; background: #FFFDF8; color: ${MUTED}; cursor: pointer;
        }
        .toggle-pill-on-income { background: ${SAGE_LIGHT}; color: ${SAGE}; border-color: ${SAGE}; }
        .toggle-pill-on-expense { background: ${WINE_LIGHT}; color: ${WINE}; border-color: ${WINE}; }
        .chip {
          font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; padding: 6px 12px; border-radius: 999px;
          border: 1px solid ${PAPER_LINE}; background: #FFFDF8; color: ${MUTED}; cursor: pointer;
        }
        .chip-on { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .tpl-chip {
          display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 5px 10px;
          border-radius: 999px; background: #FFFDF8; border: 1px solid ${PAPER_LINE}; color: ${INK}; cursor: pointer;
        }
        .ledger-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 16px;
          border-bottom: 1px solid ${PAPER_LINE};
        }
        .ledger-row:last-child { border-bottom: none; }
        .nav-tab {
          display: inline-flex; align-items: center; gap: 6px; font-family: 'IBM Plex Sans', sans-serif;
          font-size: 13px; font-weight: 500; padding: 10px 16px; border: none; background: transparent;
          color: ${MUTED}; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap;
        }
        .nav-tab-on { color: ${INK}; border-bottom-color: ${BRASS}; }
        select.ledger-input { appearance: none; }
        @media (max-width: 760px) {
          .responsive-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "24px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: INK }}>{BRAND} · 財務帳本</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="ledger-input"
              style={{ width: "auto", fontWeight: 600 }}
              title="選定分店後，總覽、記帳、報表、結帳都只顯示那家店"
            >
              <option value={ALL_STORES}>全部分店</option>
              {STORES.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              <option value={NO_STORE}>未指定分店</option>
            </select>
            <div style={{ fontSize: 12, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>{todayStr()}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid " + PAPER_LINE, marginBottom: 22, overflowX: "auto" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={"nav-tab" + (tab === t.id ? " nav-tab-on" : "")} onClick={() => setTab(t.id)}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "dashboard" && <Dashboard transactions={visibleTx} allTransactions={transactions} staff={staff} storeFilter={storeFilter} />}
        {tab === "ledger" && <LedgerView transactions={visibleTx} staff={staff} materials={materials} defaultStoreId={activeStoreId} onAdd={addTxGroup} onDelete={deleteTxGroup} />}
        {tab === "materials" && <MaterialsView materials={materials} onAdd={addMaterial} onUpdate={updateMaterial} onDelete={deleteMaterial} />}
        {/* 薪資刻意用完整 transactions，不受分店篩選影響——設計師的抽成是兩店合併計算 */}
        {tab === "staff" && (
          <PayrollLock title="員工薪資">
            <StaffView
              staff={staff} transactions={transactions} assistantItems={assistantItems} designerDeductions={designerDeductions} templates={templates}
              onAdd={addStaff} onUpdate={updateStaff} onDelete={deleteStaff} onSettle={settleStaff}
              onChangeAssistantItems={changeAssistantItems} onChangeDesignerDeductions={changeDesignerDeductions}
              onAddTemplate={addTemplate} onRemoveTemplate={removeTemplate}
            />
          </PayrollLock>
        )}
        {tab === "closing" && <DailyClosingView transactions={transactions} closings={closings} storeFilter={storeFilter} onSave={saveClosing} />}
        {tab === "reports" && <ReportsView transactions={visibleTx} allTransactions={transactions} storeFilter={storeFilter} />}
      </div>
    </div>
  );
}
