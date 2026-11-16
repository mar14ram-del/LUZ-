// =====================================================================
// storage.js — 統一的資料存取層（接 Supabase 的 kv_store）
//
// 這個檔案同時支援兩種用法，因為專案裡的模組寫法不一樣：
//
//   1. FinanceApp.jsx 用的：
//        import { loadKey, saveKey } from "./storage";
//        const txs = await loadKey("finance:transactions", []);
//        await saveKey("finance:transactions", txs);
//
//   2. salon-customers.jsx / salon-appointments.jsx 用的：
//        window.storage.get(key) / window.storage.set(key, jsonString)
//      （這兩個模組原本寫給 Claude 的環境，只要在 main.jsx 最上面
//        加一行 import "./storage.js"，它們就能正常運作，不用改）
//
// 兩種用法共用同一份快取，所以不會有「財務改了、預約沒看到」的問題。
// =====================================================================

import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------
// kv_store 的結構：
//   key        text        主鍵
//   value      jsonb
//   updated_at timestamptz
//   version    bigint      每次真的寫入時由資料庫 +1（見 db/01_kv_guard.sql）
// ---------------------------------------------------------------------
const TABLE = "kv_store";
const KEY_COL = "key";
const VAL_COL = "value";
const VER_COL = "version";

// cache   ：這台裝置「目前畫面上看到的那一份」（解析後的物件）
// remote  ：我們所知道雲端最新的那一份；跟 cache 不同時，存檔一律用合併的，不直接蓋
// versions：我們最後一次看到雲端那一列時的版本號（null = 雲端還沒有這個 key）
// failed  ：讀取失敗的 key。重新讀成功以前一律不准寫，避免拿空資料蓋掉雲端
const cache = new Map();
const remote = new Map();   // 雲端實際的那一份（合併過別台的改動後，可能比畫面上的新）
const versions = new Map();
const failed = new Set();
const warned = new Set();

function warnOnce(tag, message) {
  if (warned.has(tag)) return;
  warned.add(tag);
  if (typeof window !== "undefined" && typeof window.alert === "function") {
    try { window.alert(message); } catch (e) { /* 測試環境沒有 alert */ }
  }
}

/** 直接問雲端這個 key 現在的內容與版本。讀不到會丟出錯誤。 */
async function fetchRow(key) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(VAL_COL + "," + VER_COL)
    .eq(KEY_COL, key)
    .maybeSingle();
  if (error) throw new Error(error.message || "read failed");
  if (!data) return { found: false, value: undefined, version: null };
  const raw = data[VAL_COL];
  const value = typeof raw === "string" ? safeParse(raw, raw) : raw;
  return { found: true, value, version: data[VER_COL] };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isRecordList = (v) =>
  Array.isArray(v) && v.every((x) => x && typeof x === "object" && !Array.isArray(x) && x.id != null);
const isPlainObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/**
 * 三方合併：把「我這台從 base 改成 mine 的差異」套到雲端最新的 theirs 上。
 * 回傳 { ok, value }；ok=false 表示這種資料沒辦法安全合併。
 */
export function merge3(base, mine, theirs) {
  if (same(base, theirs)) return { ok: true, value: mine };       // 雲端其實沒變
  if (isRecordList(mine) && isRecordList(theirs) && (base == null || isRecordList(base))) {
    const baseMap = new Map((base || []).map((x) => [x.id, x]));
    const mineMap = new Map(mine.map((x) => [x.id, x]));
    const out = [];
    const used = new Set();
    // 我這邊新增的（base 沒有）放最前面，維持「新的在上面」
    mine.forEach((x) => { if (!baseMap.has(x.id)) { out.push(x); used.add(x.id); } });
    theirs.forEach((t) => {
      if (used.has(t.id)) return;
      const b = baseMap.get(t.id);
      const m = mineMap.get(t.id);
      if (b && !m) return;                                           // 我刪掉了
      if (b && m && !same(b, m)) { out.push(m); return; }            // 我改過 → 用我的
      out.push(t);                                                   // 其餘用雲端最新的
    });
    return { ok: true, value: out };
  }
  if (isPlainObject(mine) && isPlainObject(theirs) && (base == null || isPlainObject(base))) {
    const b = base || {};
    const out = { ...theirs };
    new Set([...Object.keys(b), ...Object.keys(mine)]).forEach((k) => {
      if (same(b[k], mine[k])) return;                               // 這個欄位我沒動
      if (k in mine) out[k] = mine[k]; else delete out[k];
    });
    return { ok: true, value: out };
  }
  if (Array.isArray(mine) && Array.isArray(theirs) && (base == null || Array.isArray(base))) {
    const key = (x) => JSON.stringify(x);
    const b = new Set((base || []).map(key));
    const m = new Set(mine.map(key));
    const out = theirs.filter((x) => !(b.has(key(x)) && !m.has(key(x))));   // 我刪掉的拿掉
    const have = new Set(out.map(key));
    mine.forEach((x) => { if (!b.has(key(x)) && !have.has(key(x))) out.push(x); }); // 我新增的補上
    return { ok: true, value: out };
  }
  return { ok: false };
}

/* =====================================================================
   物件介面 — FinanceApp.jsx 用這組
   ===================================================================== */

/**
 * 讀一個 key，回傳物件。找不到回傳 fallback。
 * 讀取失敗也回傳 fallback，但會把這個 key 鎖住不准寫，並提醒使用者重新整理。
 * opts.fresh = true：不用快取，一定重新問雲端。
 */
export async function loadKey(key, fallback, opts) {
  if (!(opts && opts.fresh) && cache.has(key)) return cache.get(key);
  try {
    const row = await fetchRow(key);
    failed.delete(key);
    versions.set(key, row.version);
    if (!row.found) { cache.delete(key); remote.delete(key); return fallback; }
    cache.set(key, row.value);
    remote.set(key, row.value);
    return row.value;
  } catch (e) {
    console.error("[storage] 讀取失敗", key, e);
    failed.add(key);
    warnOnce("read", "資料讀取失敗（可能是網路不穩）。為了避免蓋掉雲端資料，這次開啟的畫面不會存檔，請重新整理頁面。");
    return fallback;
  }
}

/**
 * 寫一個 key。value 傳物件或陣列，不要先 stringify。成功回傳 true。
 * 同一個 key 的寫入會排隊，一次只送一筆，避免自己跟自己搶。
 */
const queues = new Map();
export function saveKey(key, value) {
  const prev = queues.get(key) || Promise.resolve();
  const run = prev.then(() => doSave(key, value));
  queues.set(key, run.catch(() => false));
  return run;
}

async function doSave(key, value) {
  if (failed.has(key)) {
    console.error("[storage] 這個 key 讀取失敗過，為了安全不寫入：", key);
    warnOnce("blocked", "剛剛有資料沒有讀成功，這次的修改不會存檔。請重新整理頁面後再操作一次。");
    return false;
  }
  if (cache.has(key) && same(cache.get(key), value)) return true;    // 內容沒變：不寫

  const base = cache.has(key) ? cache.get(key) : null;               // 這台上次看到的那一份
  try {
    let toWrite = value;
    if (!versions.has(key)) {
      // 這台從沒讀過這個 key 就要寫：先看雲端有沒有，有的話用合併的，不直接蓋
      const row = await fetchRow(key);
      versions.set(key, row.version);
      if (row.found) remote.set(key, row.value);
    }
    if (remote.has(key) && remote.get(key) !== base) {
      // 雲端那份跟這台畫面上的不一樣（之前合併過別台的改動）：只把「這次的改動」套上去
      const m = merge3(base, value, remote.get(key));
      if (!m.ok) throw new Error("conflict");
      toWrite = m.value;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const known = versions.get(key);
      const stamp = new Date().toISOString();
      let newVersion = null;
      if (known == null) {
        // 雲端還沒有這個 key：新增（剛好被別台搶先新增就走下面的合併）
        const { data, error } = await supabase
          .from(TABLE)
          .insert({ [KEY_COL]: key, [VAL_COL]: toWrite, updated_at: stamp })
          .select(KEY_COL + "," + VER_COL);
        if (error && String(error.code) !== "23505") throw new Error(error.message || "write failed");
        if (!error && data && data.length === 1) newVersion = data[0][VER_COL];
      } else {
        // 雲端有資料：只有版本跟我上次看到的一樣才寫
        const { data, error } = await supabase
          .from(TABLE)
          .update({ [VAL_COL]: toWrite, updated_at: stamp })
          .eq(KEY_COL, key)
          .eq(VER_COL, known)
          .select(KEY_COL + "," + VER_COL);
        if (error) throw new Error(error.message || "write failed");
        if (data && data.length === 1) newVersion = data[0][VER_COL];
      }
      if (newVersion != null) {
        versions.set(key, newVersion);
        remote.set(key, toWrite);
        cache.set(key, value);                                       // 快取＝這台畫面上的那一份
        return true;
      }
      // 沒寫成：雲端被別台改過了 → 讀最新的，把「我這次的改動」合併上去再試
      const latest = await fetchRow(key);
      if (!latest.found) { versions.set(key, null); remote.delete(key); toWrite = value; continue; }
      const merged = merge3(base, value, latest.value);
      if (!merged.ok) throw new Error("conflict");
      versions.set(key, latest.version);
      remote.set(key, latest.value);
      if (same(merged.value, latest.value)) { cache.set(key, value); return true; }
      toWrite = merged.value;
    }
    throw new Error("conflict");
  } catch (e) {
    console.error("[storage] 寫入失敗", key, e && e.message);
    if (e && e.message === "conflict") {
      warnOnce("conflict:" + key, "另一台裝置剛剛改過同一份資料，這次的修改沒有存成功。請重新整理頁面後再操作一次。");
    }
    return false;
  }
}

/** 刪一個 key */
export async function removeKey(key) {
  try {
    const { error } = await supabase.from(TABLE).delete().eq(KEY_COL, key);
    if (error) throw error;
    cache.delete(key);
    remote.delete(key);
    versions.set(key, null);
    return true;
  } catch (e) {
    console.error("[storage] 刪除失敗", key, e);
    return false;
  }
}

/** 列出所有 key，可用前綴過濾 */
export async function listKeys(prefix) {
  try {
    let q = supabase.from(TABLE).select(KEY_COL);
    if (prefix) q = q.like(KEY_COL, prefix + "%");
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((r) => r[KEY_COL]);
  } catch (e) {
    console.error("[storage] 列出失敗", e);
    return [];
  }
}

/** 登出時呼叫，避免快取殘留上一個帳號的資料 */
export function clearCache() {
  cache.clear();
  remote.clear();
  versions.clear();
  failed.clear();
  warned.clear();
}

function safeParse(text, fallback) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

/* =====================================================================
   window.storage 介面 — 顧客與預約模組用這組
   這一組收發的是 JSON 字串，內部轉成物件後跟上面共用同一份快取
   ===================================================================== */

const windowStorage = {
  async get(key) {
    if (!cache.has(key)) {
      try {
        const row = await fetchRow(key);
        failed.delete(key);
        versions.set(key, row.version);
        if (row.found) { cache.set(key, row.value); remote.set(key, row.value); }
      } catch (e) {
        console.error("[storage] 讀取失敗", key, e);
        failed.add(key);
        warnOnce("read", "資料讀取失敗（可能是網路不穩）。為了避免蓋掉雲端資料，這次開啟的畫面不會存檔，請重新整理頁面。");
        throw e;
      }
    }
    if (!cache.has(key)) throw new Error("key not found: " + key);
    return { key, value: JSON.stringify(cache.get(key)), shared: false };
  },

  async set(key, value) {
    // 進來是 JSON 字串，但欄位是 jsonb，所以要先還原成物件再寫，
    // 這樣格式才會跟 FinanceApp 存的一致。
    const obj = typeof value === "string" ? safeParse(value, value) : value;
    const ok = await saveKey(key, obj);
    if (!ok) throw new Error("寫入失敗：" + key);
    return { key, value, shared: false };
  },

  async delete(key) {
    const ok = await removeKey(key);
    if (!ok) throw new Error("刪除失敗：" + key);
    return { key, deleted: true, shared: false };
  },

  async list(prefix) {
    return { keys: await listKeys(prefix), prefix, shared: false };
  },

  clearCache,
};

if (typeof window !== "undefined") {
  window.storage = windowStorage;
}

export default { loadKey, saveKey, removeKey, listKeys, clearCache };
export { windowStorage };
