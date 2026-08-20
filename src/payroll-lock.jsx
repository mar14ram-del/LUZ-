// =====================================================================
// payroll-lock.jsx — 薪資頁面的密碼鎖
//
// 第一次使用時自己設定密碼，之後每次開 app 進薪資頁都要輸入一次。
// 密碼不會存明文——存的是雜湊值，就算有人翻資料庫也看不到密碼本身。
//
// 這道鎖擋的是「有人拿到你已登入的電腦，隨手點進薪資頁」。
// 它擋不住真的懂技術的人，因為薪資資料本來就已經在瀏覽器裡了。
// 以「防員工好奇」的用途來說夠用，但你該知道它的界線在哪。
// =====================================================================

import React, { useState, useEffect } from "react";
import { Lock, Unlock, Loader2, AlertCircle, KeyRound } from "lucide-react";

export const PAYROLL_LOCK_KEY = "finance:payrollLock";

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const PAPER_RAISED = "#FCFAF3";
const BRASS = "#A9812F";
const WINE = "#7B3B34";
const WINE_LIGHT = "#F2E1DE";
const MUTED = "#8A8072";

/** SHA-256，回傳十六進位字串 */
async function hash(text) {
  const buf = new TextEncoder().encode("luz-payroll:" + text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadLock() {
  try {
    const res = await window.storage.get(PAYROLL_LOCK_KEY, false);
    return res && res.value ? JSON.parse(res.value) : null;
  } catch (e) {
    return null;
  }
}
async function saveLock(v) {
  await window.storage.set(PAYROLL_LOCK_KEY, JSON.stringify(v), false);
}

/**
 * 包住薪資頁面用。
 *   <PayrollLock><PayrollPage /></PayrollLock>
 *
 * unlocked 狀態只存在記憶體，重新整理就要再輸入一次。
 */
export default function PayrollLock({ children, title }) {
  const [ready, setReady] = useState(false);
  const [lock, setLock] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLock(await loadLock());
      setReady(true);
    })();
  }, []);

  async function setup() {
    setErr("");
    if (pw.length < 4) { setErr("密碼至少要 4 個字元。"); return; }
    if (pw !== pw2) { setErr("兩次輸入的密碼不一樣。"); return; }
    setBusy(true);
    const h = await hash(pw);
    const next = { hash: h, setAt: new Date().toISOString() };
    await saveLock(next);
    setLock(next);
    setUnlocked(true);
    setPw(""); setPw2("");
    setBusy(false);
  }

  async function unlock() {
    setErr("");
    setBusy(true);
    const h = await hash(pw);
    if (h === lock.hash) {
      setUnlocked(true);
      setPw("");
    } else {
      setErr("密碼不對，再試一次。");
    }
    setBusy(false);
  }

  const box = (inner) => (
    <div style={{
      fontFamily: "'IBM Plex Sans', sans-serif", background: PAPER, color: INK,
      minHeight: 380, display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <style>{`
        @keyframes pl-spin { to { transform: rotate(360deg); } }
        .pl-spin { animation: pl-spin 1s linear infinite; }
        .pl-card { background: ${PAPER_RAISED}; border: 1px solid ${PAPER_LINE}; border-radius: 14px;
                   padding: 30px 26px; max-width: 340px; width: 100%; text-align: center; }
        .pl-inp { font-family: inherit; font-size: 15px; color: ${INK}; background: #FFFDF8;
                  border: 1px solid ${PAPER_LINE}; border-radius: 8px; padding: 11px 12px;
                  outline: none; width: 100%; margin-bottom: 10px; text-align: center; letter-spacing: 0.12em; }
        .pl-inp:focus { border-color: ${BRASS}; box-shadow: 0 0 0 2px rgba(169,129,47,0.15); }
        .pl-btn { font-family: inherit; font-size: 15px; font-weight: 500; border-radius: 9px;
                  padding: 12px 18px; border: 1px solid ${INK}; background: ${INK}; color: ${PAPER};
                  cursor: pointer; width: 100%; display: inline-flex; align-items: center;
                  justify-content: center; gap: 7px; }
        .pl-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .pl-err { display: flex; gap: 7px; align-items: flex-start; background: ${WINE_LIGHT}; color: ${WINE};
                  padding: 9px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.6;
                  margin-bottom: 12px; text-align: left; }
      `}</style>
      <div className="pl-card">{inner}</div>
    </div>
  );

  if (!ready) {
    return box(<div style={{ color: MUTED, fontSize: 13 }}><Loader2 size={20} className="pl-spin" /></div>);
  }

  if (unlocked) return children;

  // 第一次：設定密碼
  if (!lock) {
    return box(
      <>
        <KeyRound size={26} color={BRASS} />
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: "12px 0 6px" }}>
          設定{title || "薪資"}密碼
        </div>
        <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.7, marginBottom: 18 }}>
          之後每次要看這一頁都需要輸入。密碼不會存明文，忘記的話只能重設。
        </div>
        {err && <div className="pl-err"><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{err}</div>}
        <input className="pl-inp" type="password" placeholder="設定密碼" value={pw}
          onChange={(e) => setPw(e.target.value)} autoFocus />
        <input className="pl-inp" type="password" placeholder="再輸入一次" value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setup()} />
        <button className="pl-btn" onClick={setup} disabled={busy || !pw || !pw2}>
          {busy ? <Loader2 size={15} className="pl-spin" /> : <Lock size={15} />} 設定並進入
        </button>
      </>
    );
  }

  // 之後：輸入密碼
  return box(
    <>
      <Lock size={26} color={MUTED} />
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, margin: "12px 0 6px" }}>
        {title || "薪資"}已鎖定
      </div>
      <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.7, marginBottom: 18 }}>
        輸入密碼以檢視。
      </div>
      {err && <div className="pl-err"><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{err}</div>}
      <input className="pl-inp" type="password" placeholder="密碼" value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && unlock()} autoFocus />
      <button className="pl-btn" onClick={unlock} disabled={busy || !pw}>
        {busy ? <Loader2 size={15} className="pl-spin" /> : <Unlock size={15} />} 解鎖
      </button>
      <div style={{ fontSize: 11, color: MUTED, marginTop: 14, lineHeight: 1.7 }}>
        忘記密碼？到 Supabase 的 kv_store 刪掉 {PAYROLL_LOCK_KEY} 那一列，就能重新設定。
      </div>
    </>
  );
}
