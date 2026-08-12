import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "缺少 Supabase 環境變數。請確認 .env（本機開發）或 GitHub Actions secrets（部署）裡有設定 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
