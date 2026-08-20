// =====================================================================
// storage.js — 讓 salon-customers.jsx 和 salon-appointments.jsx
//              把資料存到 Supabase，而不是瀏覽器記憶體
//
// 這兩個模組原本是寫給 Claude 的環境用的，用的是 window.storage。
// 在你自己部署的網站上 window.storage 不存在，所以資料存不進去。
// 這個檔案補上那個缺口：它做出一個一模一樣的 window.storage，
// 但背後接的是你的 Supabase。兩個模組的程式碼完全不用改。
//
// 用法：在 src/main.jsx 最上面加一行
//   import "./storage.js";
// 就好，其他什麼都不用做。
// =====================================================================

import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------
// 表格與欄位名稱。已對照過 Supabase 的 kv_store，不用改。
//
// kv_store 的結構：
//   key        text        主鍵
//   value      jsonb       ← 注意是 jsonb，不是 text
//   updated_at timestamptz
// ---------------------------------------------------------------------
const TABLE = "kv_store";
const KEY_COL = "key";
const VAL_COL = "value";

// 記憶體快取，減少重複讀取
const cache = new Map();

const supabaseStorage = {
  async get(key) {
    if (cache.has(key)) {
      return { key, value: cache.get(key), shared: false };
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
    if (!data) {
      throw new Error("key not found: " + key);
    }

    const raw = data[VAL_COL];
    const value = typeof raw === "string" ? raw : JSON.stringify(raw);
    cache.set(key, value);
    return { key, value, shared: false };
  },

  async set(key, value) {
    // value 進來是 JSON 字串，但資料庫欄位是 jsonb。
    // 直接寫字串的話會被存成「一個很長的 JSON 字串」，
    // 跟財務模組存的陣列格式不一樣，讀回來會壞掉。所以先還原成物件。
    let parsed;
    try {
      parsed = typeof value === "string" ? JSON.parse(value) : value;
    } catch (e) {
      parsed = value;   // 不是合法 JSON 就原樣存
    }

    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { [KEY_COL]: key, [VAL_COL]: parsed, updated_at: new Date().toISOString() },
        { onConflict: KEY_COL }
      );

    if (error) {
      console.error("[storage] 寫入失敗", key, error.message);
      throw error;
    }
    cache.set(key, value);
    return { key, value, shared: false };
  },

  async delete(key) {
    const { error } = await supabase.from(TABLE).delete().eq(KEY_COL, key);
    if (error) throw error;
    cache.delete(key);
    return { key, deleted: true, shared: false };
  },

  async list(prefix) {
    let q = supabase.from(TABLE).select(KEY_COL);
    if (prefix) q = q.like(KEY_COL, prefix + "%");
    const { data, error } = await q;
    if (error) throw error;
    return { keys: (data || []).map((r) => r[KEY_COL]), prefix, shared: false };
  },

  // 登出時呼叫，避免快取殘留上一個帳號的資料
  clearCache() {
    cache.clear();
  },
};

if (typeof window !== "undefined") {
  window.storage = supabaseStorage;
}

export default supabaseStorage;
export { supabaseStorage };
