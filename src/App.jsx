import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import FinanceApp from "./FinanceApp";
import CustomerApp from "./salon-customers";
import AppointmentApp from "./salon-appointments";
import PublicBookingPage from "./booking-public";

const PAPER = "#F6F1E6";
const PAPER_LINE = "#E3D8BE";
const INK = "#26211C";
const MUTED = "#8A8072";

const TABS = [
  { id: "finance", label: "財務" },
  { id: "customers", label: "顧客" },
  { id: "appointments", label: "預約" },
];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [tab, setTab] = useState("finance");
  const [route, setRoute] = useState(
    typeof window !== "undefined" ? window.location.hash : ""
  );

  // 監聽網址的 # 變化，讓 #/book 能切到公開預約頁
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // ===================================================================
  // 公開預約頁 —— 一定要放在登入檢查「之前」
  // 客人沒有帳號，這裡如果晚一步就會被登入畫面擋住
  // ===================================================================
  if (route.startsWith("#/book")) {
    return <PublicBookingPage />;
  }

  if (session === undefined) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: MUTED, fontFamily: "sans-serif" }}>
        載入中…
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <div style={{ background: PAPER, minHeight: "100vh" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          borderBottom: "1px solid " + PAPER_LINE,
          flexWrap: "wrap",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              fontFamily: "'IBM Plex Sans', sans-serif",
              fontSize: 14,
              padding: "7px 16px",
              borderRadius: 8,
              cursor: "pointer",
              border: "1px solid " + (tab === t.id ? INK : PAPER_LINE),
              background: tab === t.id ? INK : "#FFFDF8",
              color: tab === t.id ? PAPER : MUTED,
            }}
          >
            {t.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontSize: 13,
            padding: "7px 14px",
            borderRadius: 8,
            cursor: "pointer",
            border: "1px solid " + PAPER_LINE,
            background: "#FFFDF8",
            color: MUTED,
          }}
        >
          登出
        </button>
      </div>

      {tab === "finance" && <FinanceApp />}
      {tab === "customers" && <CustomerApp />}
      {tab === "appointments" && <AppointmentApp />}
    </div>
  );
}
