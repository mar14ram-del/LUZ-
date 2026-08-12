import React, { useState } from "react";
import { supabase } from "./supabaseClient";

const INK = "#26211C";
const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const BRASS = "#A9812F";
const WINE = "#7B3B34";
const MUTED = "#8A8072";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("登入失敗，請確認帳號密碼是否正確。");
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "sans-serif", padding: 20,
    }}>
      <form onSubmit={submit} style={{
        background: "#FCFAF3", border: "1px solid " + PAPER_LINE, borderRadius: 12,
        padding: 32, width: 320, display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: INK, marginBottom: 4 }}>髮廊管理系統</div>
        <label style={{ fontSize: 13, color: MUTED, display: "flex", flexDirection: "column", gap: 4 }}>
          帳號 Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid " + PAPER_LINE }} />
        </label>
        <label style={{ fontSize: 13, color: MUTED, display: "flex", flexDirection: "column", gap: 4 }}>
          密碼
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid " + PAPER_LINE }} />
        </label>
        {error && <div style={{ color: WINE, fontSize: 13 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{
          padding: 10, borderRadius: 6, border: "none", background: INK, color: PAPER,
          fontWeight: 600, cursor: "pointer",
        }}>{loading ? "登入中…" : "登入"}</button>
        <div style={{ fontSize: 11, color: MUTED }}>
          這個系統不開放自行註冊，帳號要先在 Supabase 後台的 Authentication 裡手動建立。
        </div>
      </form>
    </div>
  );
}
