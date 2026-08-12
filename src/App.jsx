import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import FinanceApp from "./FinanceApp";

const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const INK = "#26211C";
const MUTED = "#8A8072";

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ padding: 60, textAlign: "center", color: MUTED, fontFamily: "sans-serif" }}>載入中…</div>;
  }
  if (!session) return <Login />;

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 20px",
        borderBottom: "1px solid " + PAPER_LINE, background: PAPER, position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ fontWeight: 600, color: INK, fontSize: 14 }}>髮廊管理系統</div>
        <div style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>{session.user.email}</div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{ fontSize: 12, padding: "6px 12px", borderRadius: 6, border: "1px solid " + PAPER_LINE, background: "#FFFDF8", cursor: "pointer" }}
        >登出</button>
      </div>
      <FinanceApp />
    </div>
  );
}
