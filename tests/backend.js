// 測試用的後端。預設用記憶體裡的假資料庫（CI 也能跑），行為比照 db/01_kv_guard.sql：
//   內容相同不寫、筆數掉一半以上擋下、每次寫入 version +1。
// 設 REAL_DB=1 時改連本機的「真 Postgres + PostgREST」（見 docs/測試說明）。
import { createClient } from "@supabase/supabase-js";

export const REAL = !!process.env.REAL_DB;
const URL_ = "http://localhost:3112";
const state = (globalThis.__kv ||= { rows: new Map(), fail: new Set() });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function guardUpdate(old, value) {
  if (same(old.value, value)) return { skip: true };
  if (Array.isArray(old.value) && old.value.length >= 20) {
    const n = Array.isArray(value) ? value.length : 0;
    if (n < old.value.length * 0.5) return { error: { message: "kv_guard: 筆數掉太多，已擋下", code: "P0001" } };
  }
  // 比照 db/03_kv_guard_ids.sql：一次被拿掉太多 id 也擋
  if (Array.isArray(old.value) && old.value.length >= 50 && Array.isArray(value)) {
    const keep = new Set(value.filter((x) => x && x.id != null).map((x) => x.id));
    const removed = old.value.filter((x) => x && x.id != null && !keep.has(x.id)).length;
    if (removed > Math.max(10, old.value.length * 0.02)) return { error: { message: "kv_guard: 一次被拿掉太多筆，已擋下", code: "P0001" } };
  }
  return {};
}
const pick = (row, cols) => Object.fromEntries(cols.split(",").map((c) => [c, row[c]]));

function fakeClient() {
  const from = () => ({
    select(cols = "*") {
      const run = (key) => {
        if (state.fail.has(key)) return { data: null, error: { message: "network error" } };
        const r = state.rows.get(key);
        return { data: r ? structuredClone(cols === "*" ? r : pick(r, cols)) : null, error: null };
      };
      const all = () => ({ data: [...state.rows.values()].map((r) => structuredClone(cols === "*" ? r : pick(r, cols))), error: null });
      const q = { eq: (_c, key) => ({ maybeSingle: async () => run(key) }), like: async () => all(), then: (res) => res(all()) };
      return q;
    },
    insert(row) {
      const exec = async () => {
        if (state.rows.has(row.key)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        const r = { key: row.key, value: structuredClone(row.value), updated_at: row.updated_at || new Date().toISOString(), version: 1 };
        state.rows.set(row.key, r);
        return { data: [structuredClone(r)], error: null };
      };
      return { select: (cols) => exec().then((x) => (x.data ? { data: x.data.map((r) => pick(r, cols)), error: null } : x)), then: (res, rej) => exec().then(res, rej) };
    },
    upsert(row) {   // 舊版 storage.js 的寫法
      const exec = async () => {
        const old = state.rows.get(row.key);
        if (!old) { state.rows.set(row.key, { key: row.key, value: structuredClone(row.value), updated_at: row.updated_at, version: 1 }); return { error: null }; }
        const g = guardUpdate(old, row.value);
        if (g.error) return { error: g.error };
        if (!g.skip) state.rows.set(row.key, { ...old, value: structuredClone(row.value), updated_at: row.updated_at, version: old.version + 1 });
        return { error: null };
      };
      return { then: (res, rej) => exec().then(res, rej) };
    },
    update(patch) {
      const filters = {};
      const exec = async (cols) => {
        const old = state.rows.get(filters.key);
        if (!old || (filters.version != null && old.version !== filters.version)) return { data: [], error: null };
        const g = guardUpdate(old, patch.value);
        if (g.error) return { data: null, error: g.error };
        if (g.skip) return { data: [], error: null };
        const r = { ...old, value: structuredClone(patch.value), updated_at: patch.updated_at, version: old.version + 1 };
        state.rows.set(filters.key, r);
        return { data: [cols ? pick(r, cols) : structuredClone(r)], error: null };
      };
      const q = { eq(c, v) { filters[c] = v; return q; }, select: (cols) => exec(cols), then: (res, rej) => exec().then(res, rej) };
      return q;
    },
    delete() { return { eq: async (_c, key) => { state.rows.delete(key); return { error: null }; } }; },
  });
  return { from, auth: { getSession: async () => ({ data: { session: {} } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
}

export function makeClient() {
  return REAL ? createClient(URL_, "anon", { auth: { persistSession: false } }) : fakeClient();
}
export async function failRead(key) { if (REAL) await fetch(URL_ + "/__fail?key=" + key); else state.fail.add(key); }
export async function clearFail() { if (REAL) await fetch(URL_ + "/__clear"); else state.fail.clear(); }
export const READ_FAIL_WAIT = REAL ? 10000 : 600;   // 真的 supabase-js 讀取失敗會自動重試約 7 秒
