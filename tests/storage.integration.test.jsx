import React from "react";
import { render, cleanup } from "@testing-library/react";
import { makeClient, failRead, clearFail, READ_FAIL_WAIT } from "./backend";

// 預設：記憶體假資料庫。REAL_DB=1：本機真 Postgres + PostgREST。
vi.mock("../src/supabaseClient", async () => {
  const { makeClient } = await import("./backend");
  return { supabase: makeClient() };
});
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const alerts = [];
window.alert = (m) => alerts.push(m);

const admin = makeClient();
const put = async (key, value) => {
  await admin.from("kv_store").delete().eq("key", key);
  await admin.from("kv_store").insert({ key, value });
};
const get = async (key) => (await admin.from("kv_store").select("value,version").eq("key", key).maybeSingle()).data;
const device = async () => { vi.resetModules(); return await import("../src/storage"); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const recs = (n, p = "t") => Array.from({ length: n }, (_, i) => ({ id: p + i, amount: 800, type: "income", date: "2026-10-01", category: "剪髮", name: "客" + i, phone: "09" + (10000000 + i), paymentMethod: "現金", stock: 0, unit: "瓶", tags: [], visits: [] }));
const CHECKS = {
  "S16": (v) => expect(v).toBe(12),
  "S1": (v) => expect(v).toMatch(/^627；有跳提醒/),
  "S2": (v) => expect(v).toMatch(/^6849；有跳提醒/),
  "S3": (v) => expect(v).toBe(0),
  "S4": (v) => expect(v).toMatch(/^都在（共 629/),
  "S5": (v) => expect(v).toMatch(/t3已刪=true；甲新增還在=true；乙改的金額=9999.*共 50 筆/),
  "S6": (v) => expect(v).toMatch(/金額=222.*其餘 29 筆完好；存檔回報=true/),
  "S7": (v) => expect(v).toMatch(/^101／true（共 102/),
  "S8": (v) => expect(v).toMatch(/"a":2.*2026-12-31/),
  "S9": (v) => expect(v).toBe(JSON.stringify(["全勤獎金", "業績獎金", "交通津貼"])),
  "S10": (v) => expect(JSON.parse(v).sort()).toEqual(["a", "b"]),
  "S11": (v) => expect(v).toBe("10／true／0"),
  "S12": (v) => expect(v).toMatch(/^108；乙的6筆都在=true/),
  "S13": (v) => expect(v).toBe("false／100"),
  "S14": (v) => expect(v).toMatch(/甲新增還在=true；乙的備註=乙改備註；共 51/),
  "S15": (v) => expect(v).toMatch(/^0\//),
};
const out = (label, v) => { console.log("RESULT|" + label + "|" + v); CHECKS[label.split(" ")[0]](v); };

beforeEach(async () => { alerts.length = 0; cleanup(); await clearFail(); });

test("S1", async () => {
  await put("finance:transactions", recs(627));
  await failRead("finance:transactions");
  vi.resetModules();
  const { default: App } = await import("../src/FinanceApp");
  render(<App />);
  await wait(READ_FAIL_WAIT);
  await clearFail();
  out("S1 開財務帳本時帳本讀取失敗 → 雲端帳本剩幾筆(原627)", (await get("finance:transactions")).value.length + (alerts.length ? "；有跳提醒" : "；沒有任何提醒"));
});

test("S2", async () => {
  await put("customers:list", recs(6849, "c"));
  await failRead("customers:list");
  vi.resetModules();
  await import("../src/storage");
  const { default: App } = await import("../src/salon-customers");
  render(<App />);
  await wait(READ_FAIL_WAIT + 800);
  await clearFail();
  out("S2 開顧客頁時顧客資料讀取失敗 → 雲端顧客剩幾位(原6849)", (await get("customers:list")).value.length + (alerts.length ? "；有跳提醒" : "；沒有任何提醒"));
});

test("S3", async () => {
  for (const k of ["finance:transactions", "finance:staff", "finance:closings", "finance:assistantItems", "finance:designerDeductions", "finance:materials"]) await put(k, recs(30));
  await put("finance:staffItemTemplates", ["全勤獎金"]);
  const before = Object.fromEntries((await admin.from("kv_store").select("key,updated_at")).data.map((r) => [r.key, r.updated_at]));
  vi.resetModules();
  const { default: App } = await import("../src/FinanceApp");
  render(<App />);
  await wait(1500);
  const h = await admin.from("kv_store").select("key,updated_at");
  out("S3 只打開財務頁、什麼都不改 → 被重寫的資料包數(共7包)", h.data.filter((r) => r.key.startsWith("finance:") && before[r.key] !== r.updated_at).length);
});

test("S4", async () => {
  await put("finance:transactions", recs(627));
  const A = await device(); const B = await device();
  const a = await A.loadKey("finance:transactions", []); const b = await B.loadKey("finance:transactions", []);
  await A.saveKey("finance:transactions", [{ id: "LUZ", amount: 1 }, ...a]);
  await B.saveKey("finance:transactions", [{ id: "ALI", amount: 2 }, ...b]);
  const ids = (await get("finance:transactions")).value.map((t) => t.id);
  out("S4 兩家店同時開著各記一筆 → 兩筆都在嗎", (ids.includes("LUZ") && ids.includes("ALI") ? "都在" : "LUZ 店那筆不見了") + "（共 " + ids.length + " 筆，應 629）");
});

test("S5", async () => {
  await put("finance:transactions", recs(50));
  const A = await device(); const B = await device();
  const a = await A.loadKey("finance:transactions", []); const b = await B.loadKey("finance:transactions", []);
  await B.saveKey("finance:transactions", b.map((t) => (t.id === "t7" ? { ...t, amount: 9999 } : t)));
  await A.saveKey("finance:transactions", [{ id: "new", amount: 5 }, ...a.filter((t) => t.id !== "t3")]);
  const v = (await get("finance:transactions")).value; const f = (id) => v.find((t) => t.id === id);
  out("S5 甲刪t3並新增1筆、乙改t7金額 → 結果", "t3已刪=" + !f("t3") + "；甲新增還在=" + !!f("new") + "；乙改的金額=" + (f("t7") || {}).amount + "(應9999)；共 " + v.length + " 筆(應50)");
});

test("S6", async () => {
  await put("finance:transactions", recs(30));
  const A = await device(); const B = await device();
  const a = await A.loadKey("finance:transactions", []); const b = await B.loadKey("finance:transactions", []);
  await A.saveKey("finance:transactions", a.map((t) => (t.id === "t1" ? { ...t, amount: 111 } : t)));
  const ok = await B.saveKey("finance:transactions", b.map((t) => (t.id === "t1" ? { ...t, amount: 222 } : t)));
  const v = (await get("finance:transactions")).value;
  out("S6 兩台改同一筆 → 結果", "金額=" + v.find((t) => t.id === "t1").amount + "（後存的贏）；其餘 " + (v.length - 1) + " 筆完好；存檔回報=" + ok);
});

test("S7", async () => {
  await put("customers:list", recs(100, "c"));
  const A = await device(); const B = await device();
  await A.loadKey("customers:list", null); const b = await B.loadKey("customers:list", null);
  await B.saveKey("customers:list", [{ id: "別台新增" }, ...b]);
  const latest = await A.loadKey("customers:list", null, { fresh: true });
  await A.saveKey("customers:list", [{ id: "記帳時新增" }, ...latest]);
  const ids = (await get("customers:list")).value.map((c) => c.id);
  out("S7 記帳時新增客人前「重讀最新」 → 讀到幾位(雲端實際101)／別台新增的還在嗎", latest.length + "／" + ids.includes("別台新增") + "（共 " + ids.length + "，應102）");
});

test("S8", async () => {
  await put("appointments:roster", { weekly: { a: 1 }, profiles: { p: 1 }, closedDates: [] });
  const A = await device(); const B = await device();
  const a = await A.loadKey("appointments:roster", null); const b = await B.loadKey("appointments:roster", null);
  await A.saveKey("appointments:roster", { ...a, weekly: { a: 2 } });
  await B.saveKey("appointments:roster", { ...b, closedDates: ["2026-12-31"] });
  const v = (await get("appointments:roster")).value;
  out("S8 甲改班表、乙改公休日（同一包設定） → 兩邊都在嗎", "班表=" + JSON.stringify(v.weekly) + "(應a:2)；公休=" + JSON.stringify(v.closedDates));
});

test("S9", async () => {
  await put("finance:staffItemTemplates", ["全勤獎金", "業績獎金", "遲到扣款"]);
  const A = await device(); const B = await device();
  const a = await A.loadKey("finance:staffItemTemplates", []); const b = await B.loadKey("finance:staffItemTemplates", []);
  await A.saveKey("finance:staffItemTemplates", [...a, "交通津貼"]);
  await B.saveKey("finance:staffItemTemplates", b.filter((x) => x !== "遲到扣款"));
  out("S9 文字清單：甲加「交通津貼」、乙刪「遲到扣款」 → 結果", JSON.stringify((await get("finance:staffItemTemplates")).value));
});

test("S10", async () => {
  await admin.from("kv_store").delete().eq("key", "zz:new");
  const A = await device(); const B = await device();
  await A.loadKey("zz:new", []); await B.loadKey("zz:new", []);
  await A.saveKey("zz:new", [{ id: "a" }]); await B.saveKey("zz:new", [{ id: "b" }]);
  out("S10 兩台同時第一次建立同一包資料 → 結果", JSON.stringify((await get("zz:new")).value.map((x) => x.id)));
});

test("S11", async () => {
  await put("finance:materials", recs(144, "m"));
  const A = await device(); let cur = await A.loadKey("finance:materials", []);
  const ps = [];
  for (let i = 1; i <= 10; i++) { cur = cur.map((m) => (m.id === "m5" ? { ...m, stock: i } : m)); ps.push(A.saveKey("finance:materials", cur)); }
  const rs = await Promise.all(ps); const v = (await get("finance:materials")).value;
  out("S11 同一台連續快速改 10 次庫存 → 最後庫存(應10)／全部成功／誤跳提醒數", v.find((m) => m.id === "m5").stock + "／" + rs.every(Boolean) + "／" + alerts.length);
});

test("S12", async () => {
  await put("finance:transactions", recs(100));
  const A = await device(); const B = await device();
  const a = await A.loadKey("finance:transactions", []); let b = await B.loadKey("finance:transactions", []);
  for (let i = 0; i < 6; i++) { b = [{ id: "b" + i }, ...b]; await B.saveKey("finance:transactions", b); }
  await A.saveKey("finance:transactions", [{ id: "a-late" }, ...a]);
  await A.saveKey("finance:transactions", [{ id: "a-late2" }, { id: "a-late" }, ...a]);
  const ids = (await get("finance:transactions")).value.map((t) => t.id);
  out("S12 甲的畫面落後 6 版後連存兩次 → 筆數(應108)", ids.length + "；乙的6筆都在=" + [0, 1, 2, 3, 4, 5].every((i) => ids.includes("b" + i)));
});

test("S13", async () => {
  await put("finance:transactions", recs(100));
  const A = await device(); const a = await A.loadKey("finance:transactions", []);
  const ok = await A.saveKey("finance:transactions", a.slice(0, 10));
  out("S13 一次刪掉 9 成資料(100→10) → 存檔回報／雲端筆數", ok + "／" + (await get("finance:transactions")).value.length);
});

test("S14", async () => {
  await put("customers:list", recs(50, "c"));
  vi.resetModules(); await import("../src/storage"); const WA = window.storage;
  vi.resetModules(); await import("../src/storage"); const WB = window.storage;
  const a = JSON.parse((await WA.get("customers:list")).value); const b = JSON.parse((await WB.get("customers:list")).value);
  await WA.set("customers:list", JSON.stringify([{ id: "甲新增" }, ...a]));
  let err = "";
  try { await WB.set("customers:list", JSON.stringify(b.map((c) => (c.id === "c9" ? { ...c, note: "乙改備註" } : c)))); } catch (e) { err = e.message; }
  const v = (await get("customers:list")).value;
  out("S14 顧客頁：甲新增客人、乙改某位備註 → 結果", "甲新增還在=" + v.some((c) => c.id === "甲新增") + "；乙的備註=" + (v.find((c) => c.id === "c9") || {}).note + "；共 " + v.length + "(應51)" + (err ? "；錯誤:" + err : ""));
});

// 隨機亂測：3 台裝置輪流新增／修改／刪除，跟「正確答案」逐筆比對
function rng(seed) { let x = seed; return () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296; }
test("S15", async () => {
  let bad = 0, rounds = 0, detail = "";
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const rand = rng(seed);
    await put("finance:transactions", recs(30));
    const devs = [];
    for (let d = 0; d < 3; d++) { const st = await device(); devs.push({ st, view: await st.loadKey("finance:transactions", []) }); }
    const truth = new Map(recs(30).map((r) => [r.id, r]));       // 正確答案
    for (let step = 0; step < 40; step++) {
      const dev = devs[Math.floor(rand() * 3)]; const r = rand();
      if (rand() < 0.15) { dev.view = await dev.st.loadKey("finance:transactions", [], { fresh: true }); continue; } // 偶爾有人重新整理頁面
      if (r < 0.5) { const rec = { id: "n" + seed + "_" + step, amount: step }; dev.view = [rec, ...dev.view]; truth.set(rec.id, rec); }
      else if (dev.view.length) {
        const target = dev.view[Math.floor(rand() * dev.view.length)];
        if (!truth.has(target.id)) continue;                        // 別台已刪掉的就不再動它
        if (r < 0.8) { const rec = { ...target, amount: 1000 + step }; dev.view = dev.view.map((x) => (x.id === rec.id ? rec : x)); truth.set(rec.id, rec); }
        else { dev.view = dev.view.filter((x) => x.id !== target.id); truth.delete(target.id); }
      }
      await dev.st.saveKey("finance:transactions", dev.view);
    }
    const cloud = new Map((await get("finance:transactions")).value.map((r) => [r.id, r]));
    rounds++;
    const missing = [...truth.keys()].filter((id) => !cloud.has(id)); const zombie = [...cloud.keys()].filter((id) => !truth.has(id));
    const wrong = [...truth.keys()].filter((id) => cloud.has(id) && cloud.get(id).amount !== truth.get(id).amount);
    if (missing.length || zombie.length || wrong.length) { bad++; detail += " [種子" + seed + " 少" + missing.length + " 多" + zombie.length + " 值錯" + wrong.length + "]"; }
  }
  out("S15 亂數壓力測試：3 台裝置各 40 步新增/修改/刪除 × 12 輪 → 有問題的輪數", bad + "/" + rounds + detail);
});

// 小清單（少於 20 筆）資料庫安全網不會擋，只能靠前端「讀失敗就不准寫」
test("S16", async () => {
  await put("finance:staff", recs(12, "s"));
  await put("finance:transactions", recs(30));
  await failRead("finance:staff");
  vi.resetModules();
  const { default: App } = await import("../src/FinanceApp");
  render(<App />);
  await wait(READ_FAIL_WAIT);
  await clearFail();
  out("S16 開財務頁時員工名單(12人)讀取失敗 → 雲端員工剩幾位", (await get("finance:staff")).value.length);
});
