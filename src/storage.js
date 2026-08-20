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
// kv_store 的結構（已對照過，不用改）：
//   key        text        主鍵
//   value      jsonb       ← 是 jsonb，不是 text
//   updated_at timestamptz
// ---------------------------------------------------------------------
const TABLE = "kv_store";
const KEY_COL = "key";
const VAL_COL = "value";

// 快取存的是「解析後的物件」，不是字串
const cache = new Map();

/* =====================================================================
   物件介面 — FinanceApp.jsx 用這組
   ===================================================================== */

/** 讀一個 key，回傳物件。找不到或出錯時回傳 fallback。 */
export async function loadKey(key, fallback) {
  if (cache.has(key)) return cache.get(key);

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(VAL_COL)
      .eq(KEY_COL, key)
      .maybeSingle();

    if (error) {
      console.error("[storage] 讀取失敗", key, error.message);
      return fallback;
    }
    if (!data) return fallback;

    const raw = data[VAL_COL];
    // jsonb 通常直接回物件；萬一是字串就再解析一次
    const value = typeof raw === "string" ? safeParse(raw, fallback) : raw;
    cache.set(key, value);
    return value;
  } catch (e) {
    console.error("[storage] 讀取例外", key, e);
    return fallback;
  }
}

/** 寫一個 key。value 傳物件或陣列，不要先 stringify。 */
export async function saveKey(key, value) {
  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { [KEY_COL]: key, [VAL_COL]: value, updated_at: new Date().toISOString() },
        { onConflict: KEY_COL }
      );

    if (error) {
      console.error("[storage] 寫入失敗", key, error.message);
      return false;
    }
    cache.set(key, value);
    return true;
  } catch (e) {
    console.error("[storage] 寫入例外", key, e);
    return false;
  }
}

/** 刪一個 key */
export async function removeKey(key) {
  try {
    const { error } = await supabase.from(TABLE).delete().eq(KEY_COL, key);
    if (error) throw error;
    cache.delete(key);
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
    if (cache.has(key)) {
      return { key, value: JSON.stringify(cache.get(key)), shared: false };
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select(VAL_COL)
      .eq(KEY_COL, key)
      .maybeSingle();

    if (error) {
      console.error("[storage] 讀取失敗", key, error.message);
      throw error;
    }
    if (!data) throw new Error("key not found: " + key);

    const raw = data[VAL_COL];
    const obj = typeof raw === "string" ? safeParse(raw, null) : raw;
    cache.set(key, obj);
    return { key, value: JSON.stringify(obj), shared: false };
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
