// =====================================================================
// SaveStatusBanner.jsx — 畫面最上方的紅色警示欄
//
// 資料讀不到、或剛記的帳沒存進雲端時出現，問題解決前一直留著（不像 alert 按掉就沒了）。
// 出現時自動重試 3 次（每次隔 1 秒），按鈕旁邊標示「重新嘗試中 (1/3)」。
// 3 次都失敗就停下來，讓員工自己按「重新嘗試」。
// 成功後變綠色「已連線，資料已存好」；如果之前是讀取失敗，畫面上的資料不完整，
// 會自動重新整理一次，把雲端最新的帳本帶回來。
// =====================================================================

import React, { useEffect, useRef, useState } from "react";
import { getSaveStatus, subscribeSaveStatus, retrySaves } from "./storage";

const RED = "#B3261E";
const RED_LIGHT = "#FCE8E6";
const GREEN = "#2E7D32";
const GREEN_LIGHT = "#E8F5E9";
const TRIES = 3;

export default function SaveStatusBanner() {
  const [status, setStatus] = useState(getSaveStatus);
  const [attempt, setAttempt] = useState(0);        // 0 = 沒在重試；1..3 = 第幾次
  const [phase, setPhase] = useState("idle");       // idle | retrying | gaveup | done
  const running = useRef(false);
  const hadReadFail = useRef(false);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    if (getSaveStatus().readFailed.length) hadReadFail.current = true;
    setPhase("retrying");
    const ok = await retrySaves({ tries: TRIES, gap: 1000, onAttempt: (i) => setAttempt(i) });
    running.current = false;
    setAttempt(0);
    if (ok) {
      setPhase("done");
      if (hadReadFail.current) setTimeout(() => window.location.reload(), 1500);
      else setTimeout(() => setPhase("idle"), 3000);
    } else {
      setPhase("gaveup");
    }
  };

  useEffect(() => subscribeSaveStatus(setStatus), []);

  // 一出問題就自動重試一輪（3 次）。放棄後不再自動重試，等員工按按鈕。
  useEffect(() => {
    if (!status.ok && phase === "idle") run();
  }, [status.ok, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === "done") {
    return (
      <div role="status" style={bar(GREEN, GREEN_LIGHT)}>
        <span style={{ fontSize: 18 }}>✓</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>已連線，資料已存好</div>
          <div style={{ fontSize: 12 }}>{hadReadFail.current ? "重新載入最新資料中…" : "可以繼續記帳了"}</div>
        </div>
      </div>
    );
  }
  if (status.ok) return null;

  const readFail = status.readFailed.length > 0;
  const retrying = phase === "retrying";
  return (
    <div role="alert" style={bar(RED, RED_LIGHT)}>
      <span style={{ fontSize: 18 }}>⚠️</span>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontWeight: 600 }}>{readFail ? "資料讀取失敗" : "剛剛的修改還沒存進去"}</div>
        <div style={{ fontSize: 12 }}>
          {retrying
            ? "系統正在自動重試，可以繼續操作，存好後這條會變綠色。"
            : "已試了 3 次還是失敗。請按「重新嘗試」；一直不行就重新整理頁面，並確認剛記的帳還在。"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => { setPhase("idle"); }}
          disabled={retrying}
          style={{
            fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8,
            border: "none", background: RED, color: "#fff", cursor: retrying ? "default" : "pointer",
            opacity: retrying ? 0.7 : 1, whiteSpace: "nowrap",
          }}
        >
          🔄 重新嘗試
        </button>
        <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>
          {retrying ? `重新嘗試中 (${attempt}/${TRIES})` : "重試失敗"}
        </span>
      </div>
    </div>
  );
}

function bar(color, bg) {
  return {
    position: "sticky", top: 0, zIndex: 1000,
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    padding: "10px 16px", background: bg, color, borderBottom: "2px solid " + color,
    fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 14,
  };
}
