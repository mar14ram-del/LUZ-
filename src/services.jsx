// =====================================================================
// services.jsx — 服務項目與分級價目
//
// 一個服務可以有多個「分級」（例如染髮的 短／中長／長／特長），
// 每個分級各有自己的價格與時間。也可以有「加價項目」（例如上直下卷 +1000）。
//
// 這份價目表同時被三個地方使用：
//   預約模組的表單、公開預約頁、財務記帳的金額快選
// 所以只會有一份，不會出現兩邊價格不同步的問題。
// =====================================================================

import React, { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, GripVertical, ArrowUp, ArrowDown } from "lucide-react";

export const SERVICE_KEY = "appointments:services";

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const BRASS = "#A9812F";
const BRASS_LIGHT = "#F4E7C8";
const WINE = "#7B3B34";
const SAGE = "#4F6B4F";
const MUTED = "#8A8072";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

export function fmtMoney(n) {
  return "NT$" + (Math.round(Number(n) || 0)).toLocaleString("zh-TW");
}

/* =====================================================================
   預設價目（依你的價目板）
   ===================================================================== */

export const DEFAULT_SERVICES = [
  {
    id: "sv-cut", name: "剪髮",
    tiers: [
      { id: "t-cut-1", label: "方案一", price: 800, durationMin: 60 },
      { id: "t-cut-2", label: "方案二", price: 1000, durationMin: 60 },
      { id: "t-cut-3", label: "方案三", price: 2000, durationMin: 75 },
    ],
    addons: [],
  },
  {
    id: "sv-color", name: "染髮",
    tiers: [
      { id: "t-co-s", label: "短", price: 2300, durationMin: 105 },
      { id: "t-co-m", label: "中長", price: 3100, durationMin: 120 },
      { id: "t-co-l", label: "長", price: 3500, durationMin: 135 },
      { id: "t-co-xl", label: "特長", price: 3800, durationMin: 150 },
      { id: "t-co-bl", label: "去色／漂髮", price: 2200, durationMin: 150, from: true },
      { id: "t-co-ex", label: "接髮", price: 3000, durationMin: 180, from: true },
    ],
    addons: [],
  },
  {
    id: "sv-perm", name: "燙髮",
    tiers: [
      { id: "t-pe-s", label: "短", price: 2700, durationMin: 120 },
      { id: "t-pe-m", label: "中長", price: 3400, durationMin: 150 },
      { id: "t-pe-l", label: "長", price: 4100, durationMin: 165 },
      { id: "t-pe-xl", label: "特長", price: 4600, durationMin: 180 },
    ],
    addons: [
      { id: "ad-pe-updown", label: "上直下卷", price: 1000, durationMin: 30 },
    ],
  },
  {
    id: "sv-treat", name: "護髮",
    tiers: [{ id: "t-tr-1", label: "", price: 1200, durationMin: 45 }],
    addons: [],
  },
  {
    id: "sv-scalp", name: "頭皮護理",
    tiers: [{ id: "t-sc-1", label: "", price: 1500, durationMin: 60 }],
    addons: [],
  },
];

/* =====================================================================
   價目板 —— 後台一鍵套用，只動剪髮／染髮／燙髮，其他服務不碰
   ===================================================================== */

export const PRICE_BOARD = {
  "剪髮": {
    tiers: [
      { label: "方案一", price: 800, durationMin: 60 },
      { label: "方案二", price: 1000, durationMin: 60 },
      { label: "方案三", price: 2000, durationMin: 75 },
    ],
    addons: [],
  },
  "染髮": {
    tiers: [
      { label: "短", price: 2300, durationMin: 105 },
      { label: "中長", price: 3100, durationMin: 120 },
      { label: "長", price: 3500, durationMin: 135 },
      { label: "特長", price: 3800, durationMin: 150 },
      { label: "去色／漂髮", price: 2200, durationMin: 150, from: true },
      { label: "接髮", price: 3000, durationMin: 180, from: true },
    ],
    addons: [],
  },
  "燙髮": {
    tiers: [
      { label: "短", price: 2700, durationMin: 120 },
      { label: "中長", price: 3400, durationMin: 150 },
      { label: "長", price: 4100, durationMin: 165 },
      { label: "特長", price: 4600, durationMin: 180 },
    ],
    addons: [{ label: "上直下卷", price: 1000, durationMin: 30 }],
  },
};

/**
 * 把價目板套進現有服務清單。
 * 名稱對得上的就換掉分級，對不上的完全不動，缺的就新增。
 */
export function applyPriceBoard(services) {
  const list = [...(services || [])];
  Object.keys(PRICE_BOARD).forEach((name) => {
    const board = PRICE_BOARD[name];
    const tiers = board.tiers.map((t) => ({ ...t, id: uid() }));
    const addons = board.addons.map((a) => ({ ...a, id: uid() }));
    const i = list.findIndex((s) => (s.name || "").trim() === name);
    if (i >= 0) list[i] = { ...list[i], tiers, addons };
    else list.push({ id: uid(), name, tiers, addons });
  });
  return list;
}

/* =====================================================================
   資料正規化 —— 把舊格式（一個服務一個價）自動升級成分級格式
   ===================================================================== */

export function normalizeServices(raw) {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return DEFAULT_SERVICES;
  return raw.map((sv) => {
    if (Array.isArray(sv.tiers) && sv.tiers.length > 0) {
      return {
        ...sv,
        tiers: sv.tiers.map((t) => ({ ...t, id: t.id || uid() })),
        addons: (sv.addons || []).map((a) => ({ ...a, id: a.id || uid() })),
      };
    }
    // 舊格式 → 包成單一分級
    return {
      id: sv.id || uid(),
      name: sv.name || "未命名",
      tiers: [{ id: uid(), label: "", price: Number(sv.price) || 0, durationMin: Number(sv.durationMin) || 60 }],
      addons: [],
    };
  });
}

export function tiersOf(sv) {
  return (sv && sv.tiers) || [];
}
export function addonsOf(sv) {
  return (sv && sv.addons) || [];
}
export function hasTiers(sv) {
  return tiersOf(sv).length > 1;
}
export function tierById(sv, tierId) {
  const ts = tiersOf(sv);
  return ts.find((t) => t.id === tierId) || ts[0] || null;
}
export function defaultTierId(sv) {
  // 預設選最便宜的
  const ts = tiersOf(sv);
  if (ts.length === 0) return "";
  return ts.slice().sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0))[0].id;
}

/* =====================================================================
   設計師的加價／減價
   rates[serviceId] = { priceAdj, durationAdj }
   （舊格式 { price, durationMin } 是絕對值，單一分級的服務仍然支援）
   ===================================================================== */

function adjOf(roster, staffId, serviceId) {
  const prof = (roster && roster.profiles && roster.profiles[staffId]) || {};
  return (prof.rates && prof.rates[serviceId]) || {};
}

/** 某位設計師做某個服務的某個分級，實際多少錢、多久 */
export function effectiveTier(roster, staffId, sv, tierId) {
  const t = tierById(sv, tierId);
  if (!t) return { price: 0, durationMin: 0, label: "", from: false, adjusted: false };

  const a = adjOf(roster, staffId, sv.id);
  const hasAdj = a.priceAdj !== undefined || a.durationAdj !== undefined;
  // 舊的絕對值覆蓋：只在服務沒有分級時沿用
  const legacyAbs = !hasTiers(sv) && (a.price !== undefined || a.durationMin !== undefined);

  let price = Number(t.price) || 0;
  let durationMin = Number(t.durationMin) || 0;

  if (legacyAbs) {
    if (a.price !== undefined && a.price !== "") price = Number(a.price);
    if (a.durationMin !== undefined && a.durationMin !== "") durationMin = Number(a.durationMin);
  } else {
    price += Number(a.priceAdj) || 0;
    durationMin += Number(a.durationAdj) || 0;
  }

  return {
    price: Math.max(0, price),
    durationMin: Math.max(0, durationMin),
    label: t.label || "",
    from: !!t.from,
    adjusted: hasAdj || legacyAbs,
  };
}

/** 一組已選項目（服務+分級+加價）對某位設計師的總計 */
export function totalOfPicks(roster, staffId, picks, services) {
  return (picks || []).reduce(
    (acc, p) => {
      const sv = (services || []).find((s) => s.id === p.serviceId);
      if (!sv) return acc;
      const e = effectiveTier(roster, staffId, sv, p.tierId);
      let price = e.price;
      let dur = e.durationMin;
      (p.addonIds || []).forEach((aid) => {
        const ad = addonsOf(sv).find((x) => x.id === aid);
        if (ad) { price += Number(ad.price) || 0; dur += Number(ad.durationMin) || 0; }
      });
      return { price: acc.price + price, durationMin: acc.durationMin + dur, from: acc.from || e.from };
    },
    { price: 0, durationMin: 0, from: false }
  );
}

/** 某個服務在一群設計師之間的價格區間 */
export function serviceRange(roster, staffIds, sv) {
  const ids = (staffIds && staffIds.length) ? staffIds : [""];
  const prices = [];
  const durs = [];
  tiersOf(sv).forEach((t) => {
    ids.forEach((sid) => {
      const e = effectiveTier(roster, sid, sv, t.id);
      prices.push(e.price);
      durs.push(e.durationMin);
    });
  });
  if (prices.length === 0) return { minPrice: 0, maxPrice: 0, minDur: 0, maxDur: 0 };
  return {
    minPrice: Math.min(...prices), maxPrice: Math.max(...prices),
    minDur: Math.min(...durs), maxDur: Math.max(...durs),
  };
}

/** 給財務記帳用：把所有服務攤平成「分類 → 價格選項」 */
export function priceChipsByCategory(services) {
  const out = {};
  (services || []).forEach((sv) => {
    const chips = tiersOf(sv).map((t) => ({
      id: t.id,
      label: t.label || sv.name,
      price: Number(t.price) || 0,
      from: !!t.from,
    }));
    const addons = addonsOf(sv).map((a) => ({
      id: a.id, label: a.label, price: Number(a.price) || 0, addon: true,
    }));
    out[sv.name] = { chips, addons };
  });
  return out;
}

/** 收入分類清單 = 服務名稱 + 固定兩項 */
export function incomeCategories(services) {
  const names = (services || []).map((s) => s.name).filter(Boolean);
  return [...names, "產品銷售", "其他收入"];
}

/* =====================================================================
   價目編輯器
   ===================================================================== */

export function ServiceCatalogEditor({ services, onChange }) {
  const [open, setOpen] = useState("");
  const [confirmBoard, setConfirmBoard] = useState(false);
  const list = services || [];

  function update(next) { onChange(next); }

  function addService() {
    update([...list, {
      id: uid(), name: "新服務",
      tiers: [{ id: uid(), label: "", price: 0, durationMin: 60 }],
      addons: [],
    }]);
  }
  function removeService(id) { update(list.filter((s) => s.id !== id)); }
  function setService(id, patch) {
    update(list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  /** 上移／下移一個服務項目，用來自訂記帳、預約表單裡的顯示順序 */
  function moveService(id, dir) {
    const i = list.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = list.slice();
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    update(next);
  }
  function setTier(svId, tierId, patch) {
    update(list.map((s) => s.id !== svId ? s : {
      ...s, tiers: s.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)),
    }));
  }
  function addTier(svId) {
    update(list.map((s) => s.id !== svId ? s : {
      ...s, tiers: [...s.tiers, { id: uid(), label: "", price: 0, durationMin: 60 }],
    }));
  }
  function removeTier(svId, tierId) {
    update(list.map((s) => {
      if (s.id !== svId) return s;
      if (s.tiers.length <= 1) return s;   // 至少留一個
      return { ...s, tiers: s.tiers.filter((t) => t.id !== tierId) };
    }));
  }
  function setAddon(svId, adId, patch) {
    update(list.map((s) => s.id !== svId ? s : {
      ...s, addons: (s.addons || []).map((a) => (a.id === adId ? { ...a, ...patch } : a)),
    }));
  }
  function addAddon(svId) {
    update(list.map((s) => s.id !== svId ? s : {
      ...s, addons: [...(s.addons || []), { id: uid(), label: "新加價項目", price: 0, durationMin: 0 }],
    }));
  }
  function removeAddon(svId, adId) {
    update(list.map((s) => s.id !== svId ? s : {
      ...s, addons: (s.addons || []).filter((a) => a.id !== adId),
    }));
  }

  return (
    <div>
      <style>{`
        .sc-card { border: 1px solid ${PAPER_LINE}; border-radius: 10px; background: "#FFFDF8"; margin-bottom: 10px; overflow: hidden; }
        .sc-head { display: flex; align-items: center; gap: 4px; padding: 8px 13px; background: #FFFDF8; }
        .sc-head:hover { background: ${BRASS_LIGHT}; }
        .sc-reorder { display: flex; flex-direction: column; gap: 2px; margin-right: 4px; flex-shrink: 0; }
        .sc-reorder-btn {
          display: flex; align-items: center; justify-content: center; width: 22px; height: 18px;
          border: 1px solid ${PAPER_LINE}; border-radius: 4px; background: #FFFDF8; color: ${MUTED}; cursor: pointer; padding: 0;
        }
        .sc-reorder-btn:hover:not(:disabled) { border-color: ${BRASS}; color: ${BRASS}; }
        .sc-reorder-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .sc-toggle { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; cursor: pointer; padding: 3px 0; }
        .sc-name { font-size: 14.5px; font-weight: 600; color: ${INK}; }
        .sc-sum { font-size: 12px; color: ${MUTED}; font-family: 'IBM Plex Mono', monospace; margin-left: auto; }
        .sc-body { padding: 4px 13px 14px; background: ${PAPER}; }
        .sc-row { display: grid; grid-template-columns: 1fr 82px 92px 30px; gap: 7px; align-items: center; margin-bottom: 6px; }
        .sc-rowhead { font-size: 11px; color: ${MUTED}; }
        .sc-rowhead span:not(:first-child) { text-align: center; }
        .sc-sub { font-size: 11.5px; color: ${MUTED}; margin: 12px 0 6px; }
        .sc-from { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: ${MUTED}; cursor: pointer; }
        @media (max-width: 620px) {
          .sc-row { grid-template-columns: 1fr 62px 74px 28px; }
        }
      `}</style>

      <div className="field-hint" style={{ marginBottom: 10, lineHeight: 1.7 }}>
        用每個項目左邊的上下箭頭調整排列順序，這個順序會決定記帳、預約表單裡分類的排列與預設值。
      </div>

      {list.map((sv, idx) => {
        const isOpen = open === sv.id;
        const ts = tiersOf(sv);
        const prices = ts.map((t) => Number(t.price) || 0);
        const summary = ts.length === 0 ? "—"
          : (Math.min(...prices) === Math.max(...prices)
              ? fmtMoney(prices[0])
              : fmtMoney(Math.min(...prices)) + "–" + fmtMoney(Math.max(...prices)));
        return (
          <div key={sv.id} className="sc-card">
            <div className="sc-head">
              <div className="sc-reorder">
                <button type="button" className="sc-reorder-btn" disabled={idx === 0}
                  onClick={() => moveService(sv.id, -1)} aria-label="上移" title="上移">
                  <ArrowUp size={12} />
                </button>
                <button type="button" className="sc-reorder-btn" disabled={idx === list.length - 1}
                  onClick={() => moveService(sv.id, 1)} aria-label="下移" title="下移">
                  <ArrowDown size={12} />
                </button>
              </div>
              <div className="sc-toggle" onClick={() => setOpen(isOpen ? "" : sv.id)}>
                {isOpen ? <ChevronDown size={15} color={MUTED} /> : <ChevronRight size={15} color={MUTED} />}
                <span className="sc-name">{sv.name}</span>
                <span className="sc-sum">
                  {ts.length > 1 ? ts.length + " 種　" : ""}{summary}
                </span>
              </div>
            </div>

            {isOpen && (
              <div className="sc-body">
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
                  <label className="field-label" style={{ flex: 1, marginBottom: 0 }}>
                    服務名稱
                    <input className="ledger-input" value={sv.name}
                      onChange={(e) => setService(sv.id, { name: e.target.value })} />
                  </label>
                  <button type="button" className="ledger-btn ledger-btn-danger" style={{ fontSize: 12 }}
                    onClick={() => removeService(sv.id)}>
                    刪除服務
                  </button>
                </div>

                <div className="sc-sub">價格分級（例如短／中長／長。只有一個的話標籤可以留空）</div>
                <div className="sc-row sc-rowhead">
                  <span>分級名稱</span><span>時間(分)</span><span>價格</span><span />
                </div>
                {ts.map((t) => (
                  <React.Fragment key={t.id}>
                    <div className="sc-row">
                      <input className="ledger-input" placeholder="例如：中長" value={t.label || ""}
                        onChange={(e) => setTier(sv.id, t.id, { label: e.target.value })} />
                      <input type="number" className="ledger-input" style={{ textAlign: "center" }} value={t.durationMin}
                        onChange={(e) => setTier(sv.id, t.id, { durationMin: parseInt(e.target.value, 10) || 0 })} />
                      <input type="number" className="ledger-input" style={{ textAlign: "center" }} value={t.price}
                        onChange={(e) => setTier(sv.id, t.id, { price: parseFloat(e.target.value) || 0 })} />
                      {ts.length > 1 ? (
                        <button type="button" className="ledger-icon-btn" title="刪除這個分級"
                          onClick={() => removeTier(sv.id, t.id)}><Trash2 size={14} /></button>
                      ) : <span />}
                    </div>
                    <label className="sc-from" style={{ marginBottom: 8 }}>
                      <input type="checkbox" checked={!!t.from}
                        onChange={(e) => setTier(sv.id, t.id, { from: e.target.checked })} />
                      這個分級是「起價」（例如去色／漂髮，實際依狀況報價）
                    </label>
                  </React.Fragment>
                ))}
                <button type="button" className="ledger-btn" style={{ fontSize: 12 }} onClick={() => addTier(sv.id)}>
                  <Plus size={13} /> 加一個分級
                </button>

                <div className="sc-sub">加價項目（例如上直下卷，可複選）</div>
                {addonsOf(sv).map((a) => (
                  <div key={a.id} className="sc-row">
                    <input className="ledger-input" value={a.label}
                      onChange={(e) => setAddon(sv.id, a.id, { label: e.target.value })} />
                    <input type="number" className="ledger-input" style={{ textAlign: "center" }} value={a.durationMin}
                      onChange={(e) => setAddon(sv.id, a.id, { durationMin: parseInt(e.target.value, 10) || 0 })} />
                    <input type="number" className="ledger-input" style={{ textAlign: "center" }} value={a.price}
                      onChange={(e) => setAddon(sv.id, a.id, { price: parseFloat(e.target.value) || 0 })} />
                    <button type="button" className="ledger-icon-btn" onClick={() => removeAddon(sv.id, a.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" className="ledger-btn" style={{ fontSize: 12 }} onClick={() => addAddon(sv.id)}>
                  <Plus size={13} /> 加一個加價項目
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="ledger-btn" onClick={addService}>
          <Plus size={14} /> 新增服務
        </button>
        {!confirmBoard ? (
          <button type="button" className="ledger-btn" onClick={() => setConfirmBoard(true)}>
            套用店內價目板
          </button>
        ) : (
          <>
            <button type="button" className="ledger-btn ledger-btn-primary"
              onClick={() => { update(applyPriceBoard(list)); setConfirmBoard(false); }}>
              確定套用
            </button>
            <button type="button" className="ledger-btn" onClick={() => setConfirmBoard(false)}>
              取消
            </button>
          </>
        )}
      </div>

      {confirmBoard && (
        <div style={{
          marginTop: 10, padding: "11px 13px", borderRadius: 8,
          background: BRASS_LIGHT, color: BRASS, fontSize: 12.5, lineHeight: 1.7,
        }}>
          會把 <strong>剪髮</strong>（800／1000／2000）、<strong>染髮</strong>（短～特長、去色、接髮）、
          <strong>燙髮</strong>（短～特長＋上直下卷加價）換成價目板的分級。
          這三個以外的服務完全不動。時間是預估值，套用後記得改成實際的。
        </div>
      )}

      <div className="field-hint" style={{ marginTop: 10, lineHeight: 1.7 }}>
        這份價目表同時用於預約表單、公開預約頁與財務記帳的金額快選。
        設計師的個別加價在「設計師與班表」裡設定。
      </div>
    </div>
  );
}
