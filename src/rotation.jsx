// =====================================================================
// rotation.jsx — 不指定設計師的排班表（每個服務項目一張）
//
// 客人在預約頁選「不指定」時，資料庫會依「第一個選的項目」的排班表
// 輪流排人：上一位排給友惟，下一位就從馬克開始。
//
// 客人一次選多個項目時，被排到的人在「其他項目」的表會 +1，
// 下次在那張表輪到他時跳過一次（並扣掉 1）。
//
// 資料存在 Supabase 的 booking_rotation 表：
//   staff_ids     參加的設計師（有順序）；null = 全部設計師都參加
//   next_staff_id 下一位輪到誰
//   credits       {設計師id: +幾次}
// 實際排人的邏輯在資料庫的 assign_designer_for_request()，這裡只負責編輯。
// =====================================================================

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { ChevronUp, ChevronDown, Minus, Plus, X, RefreshCw, Loader2 } from "lucide-react";

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const BRASS = "#A9812F";
const BRASS_LIGHT = "#F4E7C8";
const WINE = "#7B3B34";
const SAGE = "#4F6B4F";
const SAGE_LIGHT = "#E3EADD";
const MUTED = "#8A8072";

export function RotationEditor({ services, designers }) {
  const [rows, setRows] = useState({});      // service_id -> row
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from("booking_rotation").select("*");
    if (err) setError("讀取排班表失敗：" + err.message);
    else {
      const m = {};
      (data || []).forEach((r) => { m[r.service_id] = r; });
      setRows(m);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const nameOf = (id) => {
    const d = (designers || []).find((x) => x.id === id);
    return d ? d.name : "（已移除）";
  };
  const allIds = (designers || []).map((d) => d.id);

  async function save(serviceId, patch) {
    const cur = rows[serviceId] || { service_id: serviceId, staff_ids: null, next_staff_id: null, credits: {} };
    const next = { ...cur, ...patch, service_id: serviceId, updated_at: new Date().toISOString() };
    setRows((prev) => ({ ...prev, [serviceId]: next }));   // 先更新畫面
    setSavingId(serviceId);
    const { error: err } = await supabase.from("booking_rotation").upsert({
      service_id: serviceId,
      staff_ids: next.staff_ids,
      next_staff_id: next.next_staff_id,
      credits: next.credits || {},
      updated_at: next.updated_at,
    });
    setSavingId("");
    if (err) {
      setError("儲存失敗：" + err.message);
      load();
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 12.5, color: MUTED, lineHeight: 1.7 }}>
          客人選「不指定」時，依第一個選的項目的表輪流排人。沒加入的設計師不會被排到那個項目。
          客人同時選多個項目時，被排到的人在其他項目會 +1，下次輪到他時跳過一次。
        </div>
        <button type="button" className="ledger-btn" onClick={load} disabled={loading} style={{ fontSize: 12 }}>
          {loading ? <Loader2 size={13} /> : <RefreshCw size={13} />} 重新讀取
        </button>
      </div>

      {error && (
        <div style={{ background: "#F2E1DE", color: WINE, padding: "8px 11px", borderRadius: 7, fontSize: 12.5, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {(services || []).map((sv) => {
        const row = rows[sv.id];
        const isDefault = !row || !Array.isArray(row.staff_ids);
        const list = isDefault ? allIds : row.staff_ids;
        const credits = (row && row.credits) || {};
        const nextId = row && row.next_staff_id && list.includes(row.next_staff_id) ? row.next_staff_id : list[0];
        const outside = allIds.filter((id) => !list.includes(id));

        function setList(newList) {
          // 原本輪到的人被移出時，改成從新名單第一位開始
          const keepNext = row && row.next_staff_id && newList.includes(row.next_staff_id) ? row.next_staff_id : (newList[0] || null);
          save(sv.id, { staff_ids: newList, next_staff_id: keepNext });
        }
        function move(idx, dir) {
          const j = idx + dir;
          if (j < 0 || j >= list.length) return;
          const nl = list.slice();
          const t = nl[idx]; nl[idx] = nl[j]; nl[j] = t;
          setList(nl);
        }
        function adjust(id, delta) {
          const n = Math.max(0, (parseInt(credits[id], 10) || 0) + delta);
          save(sv.id, { credits: { ...credits, [id]: n } });
        }

        return (
          <div key={sv.id} style={{ border: "1px solid " + PAPER_LINE, borderRadius: 9, background: "#FFFDF8", padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: INK }}>{sv.name}</span>
              {isDefault && <span style={{ fontSize: 11.5, color: MUTED }}>（尚未設定，目前全部設計師都參加）</span>}
              {savingId === sv.id && <span style={{ fontSize: 11.5, color: MUTED }}>儲存中…</span>}
            </div>

            {list.length === 0 && (
              <div style={{ fontSize: 12.5, color: WINE, marginBottom: 6 }}>沒有人參加，不指定的客人選這個項目會約不到。</div>
            )}

            {list.map((id, idx) => {
              const c = parseInt(credits[id], 10) || 0;
              const isNext = id === nextId;
              return (
                <div key={id} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 7,
                  background: isNext ? BRASS_LIGHT : PAPER, marginBottom: 4, flexWrap: "wrap",
                }}>
                  <span style={{ width: 18, fontSize: 12, color: MUTED, fontFamily: "'IBM Plex Mono', monospace" }}>{idx + 1}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{nameOf(id)}</span>
                  {c > 0 && (
                    <span title={"下次輪到時跳過 " + c + " 次"} style={{ fontSize: 11, fontWeight: 700, color: BRASS, fontFamily: "'IBM Plex Mono', monospace" }}>+{c}</span>
                  )}
                  {isNext && <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: BRASS, color: "white" }}>下一位</span>}
                  <span style={{ flex: 1 }} />
                  {!isNext && (
                    <button type="button" className="ledger-btn" style={{ fontSize: 11, padding: "3px 8px" }}
                      onClick={() => save(sv.id, { next_staff_id: id })}>
                      設為下一位
                    </button>
                  )}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: MUTED }} title="+次數：輪到時跳過幾次">
                    <button type="button" className="ledger-icon-btn" onClick={() => adjust(id, -1)} aria-label="減少跳過次數" disabled={c === 0}><Minus size={12} /></button>
                    次數
                    <button type="button" className="ledger-icon-btn" onClick={() => adjust(id, 1)} aria-label="增加跳過次數"><Plus size={12} /></button>
                  </span>
                  <button type="button" className="ledger-icon-btn" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="往前"><ChevronUp size={14} /></button>
                  <button type="button" className="ledger-icon-btn" onClick={() => move(idx, 1)} disabled={idx === list.length - 1} aria-label="往後"><ChevronDown size={14} /></button>
                  <button type="button" className="ledger-icon-btn" onClick={() => setList(list.filter((x) => x !== id))} aria-label="移出排班"><X size={14} /></button>
                </div>
              );
            })}

            {outside.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {outside.map((id) => (
                  <button key={id} type="button" onClick={() => setList([...list, id])}
                    style={{
                      fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                      border: "1px dashed " + PAPER_LINE, background: "white", color: MUTED,
                    }}>
                    + {nameOf(id)}
                  </button>
                ))}
              </div>
            )}

            {!isDefault && (
              <div style={{ marginTop: 6 }}>
                <button type="button" onClick={() => save(sv.id, { staff_ids: null })}
                  style={{ fontSize: 11.5, color: SAGE, background: SAGE_LIGHT, border: "none", borderRadius: 6, padding: "3px 9px", cursor: "pointer" }}>
                  改回全部設計師參加
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
