// =====================================================================
// 後台「優惠券」頁：設定券的種類、手動發給客人、看符合自動條件的名單、傳 LINE 通知
// 規則判斷都在 coupons.js（有測試）；發券／使用紀錄在 coupon-store.js
// =====================================================================
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Send, Users, X, Check, Gift, MessageCircle } from "lucide-react";
import { loadKey, saveKey } from "./storage";
import { SERVICE_KEY, normalizeServices } from "./services";
import {
  COUPON_KEY, TRIGGERS, REWARDS, blankCoupon, rewardLabel, triggerLabel,
  eligibleCustomers, expiryFor, couponMessage,
} from "./coupons";
import { loadGrants, issueGrants, sendLine, markNotified } from "./coupon-store";

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const PAPER_RAISED = "#FCFAF3";
const BRASS = "#A9812F";
const WINE = "#7B3B34";
const SAGE = "#4F6B4F";
const SAGE_LIGHT = "#E3EADD";
const MUTED = "#8A8072";

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export default function PromoApp() {
  const [loaded, setLoaded] = useState(false);
  const [coupons, setCoupons] = useState([]);
  const [services, setServices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [grants, setGrants] = useState([]);
  const [editing, setEditing] = useState(null);      // 正在編輯的券（副本）
  const [panel, setPanel] = useState(null);          // { kind: "issue" | "list", coupon }
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const [cp, svc, cs, tx] = await Promise.all([
        loadKey(COUPON_KEY, []), loadKey(SERVICE_KEY, null),
        loadKey("customers:list", []), loadKey("finance:transactions", []),
      ]);
      setCoupons(Array.isArray(cp) ? cp : []);
      setServices(normalizeServices(svc));
      setCustomers(Array.isArray(cs) ? cs : []);
      setTransactions(Array.isArray(tx) ? tx : []);
      try { setGrants(await loadGrants()); } catch (e) { setErr("讀取發券紀錄失敗：" + e.message); }
      setLoaded(true);
    })();
  }, []);

  const serviceNames = useMemo(() => services.map((s) => s.name).filter(Boolean), [services]);

  async function saveCoupon(c) {
    if (!c.name.trim()) { setErr("請填券的名稱"); return; }
    const next = coupons.some((x) => x.id === c.id) ? coupons.map((x) => (x.id === c.id ? c : x)) : [c, ...coupons];
    setCoupons(next);
    await saveKey(COUPON_KEY, next);
    setEditing(null); setErr(""); flash("已儲存「" + c.name + "」");
  }

  function flash(t) { setMsg(t); setTimeout(() => setMsg(""), 3500); }

  const stats = useMemo(() => {
    const m = {};
    grants.forEach((g) => {
      const s = (m[g.coupon_id] ||= { issued: 0, used: 0 });
      if (g.source === "manual") s.issued += 1;
      if (g.used_at) s.used += 1;
    });
    return m;
  }, [grants]);

  if (!loaded) return <div style={{ padding: 60, textAlign: "center", color: MUTED }}>優惠券載入中…</div>;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: INK, maxWidth: 920, margin: "0 auto", padding: "22px 18px 60px" }}>
      <style>{`
        .field-label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: ${MUTED}; margin-bottom: 10px; }
        .ledger-input { font-family: inherit; font-size: 14px; color: ${INK}; background: #FFFDF8; border: 1px solid ${PAPER_LINE};
          border-radius: 6px; padding: 8px 10px; outline: none; width: 100%; box-sizing: border-box; }
        .ledger-input:focus { border-color: ${BRASS}; }
        .ledger-btn { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 13px; font-weight: 500;
          color: ${INK}; background: #FFFDF8; border: 1px solid ${PAPER_LINE}; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
        .ledger-btn:hover { border-color: ${BRASS}; }
        .ledger-btn:disabled { opacity: .5; cursor: default; }
        .ledger-btn-primary { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .pchip { font-family: inherit; font-size: 13px; padding: 6px 12px; border-radius: 999px; border: 1px solid ${PAPER_LINE};
          background: #FFFDF8; color: ${MUTED}; cursor: pointer; }
        .pchip-on { background: ${INK}; color: ${PAPER}; border-color: ${INK}; }
        .cp-card { background: ${PAPER_RAISED}; border: 1px solid ${PAPER_LINE}; border-radius: 10px; padding: 14px 16px; }
        .two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
        @media (max-width: 620px) { .two { grid-template-columns: 1fr; } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 26, margin: 0, flex: 1 }}>優惠券</h2>
        <button className="ledger-btn ledger-btn-primary" onClick={() => { setEditing(blankCoupon()); setPanel(null); }}>
          <Plus size={15} /> 新增優惠券
        </button>
      </div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, marginBottom: 14 }}>
        記帳時選了客人，就會列出他可以用的券，按一下折抵。自動條件（生日、第一次消費後…）不用先發，到店結帳時系統會自己判斷。
        <br />「加 LINE 好友送券」請在 LINE 官方帳號後台設定歡迎訊息＋優惠券；客人到店出示後，在這裡「手動發」同名的券再記帳用掉。
      </div>
      {msg && <div style={{ background: SAGE_LIGHT, color: SAGE, padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{msg}</div>}
      {err && <div style={{ background: "#F2E1DE", color: WINE, padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{err}</div>}

      {editing && (
        <CouponEditor value={editing} serviceNames={serviceNames} onCancel={() => setEditing(null)} onSave={saveCoupon} />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {coupons.length === 0 && !editing && (
          <div className="cp-card" style={{ color: MUTED, fontSize: 14 }}>還沒有優惠券。按右上角「新增優惠券」開始。</div>
        )}
        {coupons.map((c) => {
          const s = stats[c.id] || { issued: 0, used: 0 };
          const open = panel && panel.coupon.id === c.id;
          return (
            <div key={c.id} className="cp-card" style={{ opacity: c.active === false ? 0.6 : 1 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <Gift size={18} color={BRASS} style={{ marginTop: 3 }} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    {c.name} {c.active === false && <span style={{ fontSize: 12, color: WINE, fontWeight: 400 }}>（已停用）</span>}
                  </div>
                  <div style={{ fontSize: 13, color: MUTED, marginTop: 3, lineHeight: 1.7 }}>
                    {rewardLabel(c)}
                    {(c.services || []).length > 0 && c.reward.kind !== "free" && "・限" + c.services.join("／")}
                    {Number(c.minSpend) > 0 && "・滿 NT$" + Number(c.minSpend).toLocaleString()}
                    {"・" + triggerLabel(c)}
                    {"・每人 " + (Number(c.perCustomer) || 1) + " 次" + (c.trigger.kind === "birthday" ? "／年" : "")}
                    {c.endDate && "・活動到 " + c.endDate.replace(/-/g, "/")}
                    <br />已發 {s.issued} 張・已用 {s.used} 次
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="ledger-btn" onClick={() => { setEditing({ ...c }); setPanel(null); }}><Pencil size={13} /> 編輯</button>
                  <button className="ledger-btn" onClick={() => setPanel(open && panel.kind === "issue" ? null : { kind: "issue", coupon: c })}><Send size={13} /> 發給客人</button>
                  {c.trigger.kind !== "manual" && (
                    <button className="ledger-btn" onClick={() => setPanel(open && panel.kind === "list" ? null : { kind: "list", coupon: c })}><Users size={13} /> 名單</button>
                  )}
                </div>
              </div>
              {open && panel.kind === "issue" && (
                <IssuePanel coupon={c} customers={customers}
                  onDone={(newGrants, text) => { setGrants((g) => [...newGrants, ...g]); setPanel(null); flash(text); }}
                  onError={setErr} />
              )}
              {open && panel.kind === "list" && (
                <EligiblePanel coupon={c} customers={customers} grants={grants} transactions={transactions} onError={setErr} onFlash={flash} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 券的設定 ---------------- */

function CouponEditor({ value, serviceNames, onSave, onCancel }) {
  const [c, setC] = useState(value);
  const set = (k, v) => setC((p) => ({ ...p, [k]: v }));
  const setR = (k, v) => setC((p) => ({ ...p, reward: { ...p.reward, [k]: v } }));
  const setT = (k, v) => setC((p) => ({ ...p, trigger: { ...p.trigger, [k]: v } }));
  const toggleSvc = (n) => setC((p) => {
    if (p.reward.kind === "free") return { ...p, services: [n] };
    const has = p.services.includes(n);
    return { ...p, services: has ? p.services.filter((x) => x !== n) : [...p.services, n] };
  });

  return (
    <div className="cp-card" style={{ borderColor: BRASS, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{value.name ? "編輯優惠券" : "新增優惠券"}</div>
      <label className="field-label">名稱（客人會看到）
        <input className="ledger-input" value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="例如：生日快樂折 200" />
      </label>

      <div className="field-label">獎勵
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {REWARDS.map((r) => (
            <button key={r.id} type="button" className={"pchip" + (c.reward.kind === r.id ? " pchip-on" : "")}
              onClick={() => setC((p) => ({ ...p, reward: { ...p.reward, kind: r.id }, services: r.id === "free" ? p.services.slice(0, 1) : p.services }))}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {c.reward.kind === "amount" && (
        <label className="field-label">折抵金額（元）
          <input type="number" className="ledger-input" value={c.reward.value} onChange={(e) => setR("value", e.target.value)} />
        </label>
      )}
      {c.reward.kind === "percent" && (
        <label className="field-label">打幾折（9 = 九折、85 = 八五折）
          <input type="number" className="ledger-input" value={c.reward.value} onChange={(e) => setR("value", e.target.value)} />
        </label>
      )}

      <div className="field-label">{c.reward.kind === "free" ? "送哪一項服務（選一項）" : "限用服務（不選 = 任何服務都能用；產品不能用券）"}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {serviceNames.map((n) => (
            <button key={n} type="button" className={"pchip" + (c.services.includes(n) ? " pchip-on" : "")} onClick={() => toggleSvc(n)}>{n}</button>
          ))}
        </div>
      </div>

      <div className="field-label">什麼時候給客人
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TRIGGERS.map((t) => (
            <button key={t.id} type="button" className={"pchip" + (c.trigger.kind === t.id ? " pchip-on" : "")} onClick={() => setT("kind", t.id)}>{t.label}</button>
          ))}
        </div>
      </div>
      {c.trigger.kind === "dormant" && (
        <label className="field-label">幾個月沒來
          <input type="number" className="ledger-input" value={c.trigger.months} onChange={(e) => setT("months", e.target.value)} />
        </label>
      )}
      {c.trigger.kind === "visits" && (
        <label className="field-label">來過幾次以上（同一天算一次）
          <input type="number" className="ledger-input" value={c.trigger.count} onChange={(e) => setT("count", e.target.value)} />
        </label>
      )}

      <div className="two">
        <label className="field-label">消費門檻（這筆滿多少元才能用，0 = 不限）
          <input type="number" className="ledger-input" value={c.minSpend} onChange={(e) => set("minSpend", e.target.value)} />
        </label>
        <label className="field-label">每人可用幾次{c.trigger.kind === "birthday" ? "（每年重算）" : ""}
          <input type="number" min="1" className="ledger-input" value={c.perCustomer} onChange={(e) => set("perCustomer", e.target.value)} />
        </label>
        <label className="field-label">活動開始（空白 = 不限）
          <input type="date" className="ledger-input" value={c.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </label>
        <label className="field-label">活動結束（空白 = 不限）
          <input type="date" className="ledger-input" value={c.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </label>
        {c.trigger.kind === "manual" && (
          <label className="field-label">發出去後幾天內有效（0 = 到活動結束）
            <input type="number" className="ledger-input" value={c.validDays} onChange={(e) => set("validDays", e.target.value)} />
          </label>
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, margin: "4px 0 12px" }}>
        <input type="checkbox" checked={c.active !== false} onChange={(e) => set("active", e.target.checked)} />
        啟用（取消勾選＝停用，已發出去的券也不能用）
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="ledger-btn ledger-btn-primary" onClick={() => onSave({
          ...c,
          reward: { ...c.reward, value: Number(c.reward.value) || 0 },
          minSpend: Number(c.minSpend) || 0, perCustomer: Math.max(1, Number(c.perCustomer) || 1),
          validDays: Number(c.validDays) || 0,
          trigger: { ...c.trigger, months: Number(c.trigger.months) || 0, count: Number(c.trigger.count) || 0 },
        })}><Check size={14} /> 儲存</button>
        <button className="ledger-btn" onClick={onCancel}><X size={14} /> 取消</button>
      </div>
    </div>
  );
}

/* ---------------- 手動發券 ---------------- */

function CustomerSearch({ customers, picked, onToggle }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return [];
    return customers.filter((c) =>
      (c.name || "").toLowerCase().includes(s) || (c.nickname || "").toLowerCase().includes(s) ||
      (s.length >= 3 && String(c.phone || "").replace(/\D/g, "").includes(s.replace(/\D/g, "") || "x"))
    ).slice(0, 12);
  }, [q, customers]);
  return (
    <div>
      <input className="ledger-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="輸入姓名、暱稱或電話（末 3 碼以上）" />
      {hits.length > 0 && (
        <div style={{ border: "1px solid " + PAPER_LINE, borderRadius: 6, marginTop: 4, background: "#FFFDF8" }}>
          {hits.map((c) => (
            <button key={c.id} type="button" onClick={() => onToggle(c)}
              style={{ display: "flex", width: "100%", gap: 8, alignItems: "center", padding: "8px 10px", border: "none",
                borderBottom: "1px solid " + PAPER_LINE, background: picked.has(c.id) ? SAGE_LIGHT : "transparent", cursor: "pointer", textAlign: "left", fontSize: 14 }}>
              {picked.has(c.id) ? <Check size={14} color={SAGE} /> : <span style={{ width: 14 }} />}
              <span style={{ flex: 1 }}>{c.name}{c.nickname ? "（" + c.nickname + "）" : ""}</span>
              <span style={{ color: MUTED, fontSize: 12 }}>{c.phone}</span>
              {c.lineUserId && <span style={{ fontSize: 11, color: SAGE }}>LINE</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IssuePanel({ coupon, customers, onDone, onError }) {
  const [picked, setPicked] = useState(new Map());
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const expires = expiryFor(coupon, todayStr());
  const list = Array.from(picked.values());
  const withLine = list.filter((c) => c.lineUserId);

  function toggle(c) {
    setPicked((p) => { const m = new Map(p); if (m.has(c.id)) m.delete(c.id); else m.set(c.id, c); return m; });
  }

  async function go() {
    if (list.length === 0) return;
    setBusy(true);
    try {
      const made = await issueGrants(coupon.id, list.map((c) => c.id), expires);
      let sent = 0; const failed = [];
      if (notify) {
        const ok = [];
        for (const c of withLine) {
          const r = await sendLine(c.lineUserId, couponMessage(coupon, c, expires));
          if (r.ok) { sent += 1; const g = made.find((x) => x.customer_id === c.id); if (g) ok.push(g.id); }
          else failed.push(c.name + "：" + r.error);
        }
        await markNotified(ok);
      }
      onDone(made, "已發給 " + made.length + " 位" + (notify ? "，LINE 通知送出 " + sent + " 則" : "") +
        (failed.length ? "；沒送到：" + failed.join("、") : ""));
    } catch (e) {
      onError("發券失敗：" + e.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE }}>
      <div className="field-label">發給誰（可以選多位）
        <CustomerSearch customers={customers} picked={picked} onToggle={toggle} />
      </div>
      {list.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {list.map((c) => (
            <span key={c.id} className="pchip pchip-on" onClick={() => toggle(c)} style={{ cursor: "pointer" }}>{c.name} ✕</span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
        {expires ? "有效到 " + expires.replace(/-/g, "/") : "沒有期限"}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 10 }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
        同時傳 LINE 通知（{withLine.length} / {list.length} 位已連結 LINE，沒連結的不會收到）
      </label>
      <button className="ledger-btn ledger-btn-primary" disabled={busy || list.length === 0} onClick={go}>
        <Send size={14} /> {busy ? "處理中…" : "發給 " + list.length + " 位" + (notify && withLine.length ? "，傳 LINE 給 " + withLine.length + " 人" : "")}
      </button>
    </div>
  );
}

/* ---------------- 自動條件的名單 ---------------- */

function EligiblePanel({ coupon, customers, grants, transactions, onError, onFlash }) {
  const list = useMemo(
    () => eligibleCustomers({ coupon, customers, grants, transactions, date: todayStr() }),
    [coupon, customers, grants, transactions]
  );
  const withLine = list.filter((c) => c.lineUserId);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  async function notifyAll() {
    if (!armed) { setArmed(true); return; }
    setArmed(false); setBusy(true);
    let sent = 0; const failed = [];
    try {
      for (const c of withLine) {
        const r = await sendLine(c.lineUserId, couponMessage(coupon, c, coupon.endDate || ""));
        if (r.ok) sent += 1; else failed.push(c.name);
      }
      onFlash("LINE 通知送出 " + sent + " 則" + (failed.length ? "；沒送到 " + failed.length + " 位（可能沒加好友或已封鎖）：" + failed.join("、") : ""));
    } catch (e) { onError("傳送失敗：" + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed " + PAPER_LINE }}>
      <div style={{ fontSize: 14, marginBottom: 8 }}>
        今天符合「{triggerLabel(coupon)}」、還沒用完次數的客人：<b>{list.length}</b> 位，其中 {withLine.length} 位已連結 LINE。
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>這些客人不用另外發券，到店記帳選了他就會出現這張券。</div>
      </div>
      <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid " + PAPER_LINE, borderRadius: 6, background: "#FFFDF8", fontSize: 13.5 }}>
        {list.slice(0, 300).map((c) => (
          <div key={c.id} style={{ display: "flex", gap: 8, padding: "6px 10px", borderBottom: "1px solid " + PAPER_LINE }}>
            <span style={{ flex: 1 }}>{c.name}</span>
            <span style={{ color: MUTED }}>{c.phone}</span>
            {c.lineUserId && <MessageCircle size={14} color={SAGE} />}
          </div>
        ))}
        {list.length > 300 && <div style={{ padding: 8, color: MUTED }}>…還有 {list.length - 300} 位</div>}
        {list.length === 0 && <div style={{ padding: 10, color: MUTED }}>目前沒有人符合。</div>}
      </div>
      {withLine.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="ledger-btn ledger-btn-primary" disabled={busy} onClick={notifyAll}>
            <MessageCircle size={14} /> {busy ? "傳送中…" : armed ? "確定傳給 " + withLine.length + " 人？再按一次送出" : "傳 LINE 通知給 " + withLine.length + " 人"}
          </button>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 5 }}>LINE 官方帳號每月免費訊息有上限，超過要付費或送不出去。</div>
        </div>
      )}
    </div>
  );
}
