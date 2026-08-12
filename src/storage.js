import { supabase } from "./supabaseClient";

// 這兩個函式的用法跟原本 Claude Artifact 裡的 window.storage 一樣：
// loadKey(key, fallback) / saveKey(key, value)
// 差別是資料現在存在 Supabase 的 kv_store 資料表裡，而不是 Claude 帳號下。

export async function loadKey(key, fallback) {
  try {
    const { data, error } = await supabase
      .from("kv_store")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) {
      console.error("讀取失敗", key, error);
      return fallback;
    }
    if (!data) return fallback;
    return data.value;
  } catch (e) {
    console.error("讀取失敗", key, e);
    return fallback;
  }
}

export async function saveKey(key, value) {
  try {
    const { error } = await supabase
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.error("儲存失敗", key, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("儲存失敗", key, e);
    return false;
  }
}
