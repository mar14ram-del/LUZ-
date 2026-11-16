// 部署前檢查：專抓「建置會綠勾、但上線是壞的」那幾種狀況
// 用法：node scripts/preflight.mjs          （本機或 CI，建置前）
//       node scripts/preflight.mjs --dist   （建置後，再檢查產出的檔案）
import fs from "node:fs";
import path from "node:path";

const errors = [];
const root = process.cwd();

// 1. 程式檔放錯位置：根目錄不該有 .jsx，也不該有跟 src/ 同名的 .js
const srcNames = new Set(fs.existsSync("src") ? fs.readdirSync("src") : []);
const allowedRootJs = new Set(["vite.config.js", "eslint.config.js", "vitest.config.js"]);
for (const f of fs.readdirSync(root)) {
  if (f.endsWith(".jsx") || (f.endsWith(".js") && !allowedRootJs.has(f) && srcNames.has(f))) {
    errors.push(`「${f}」放在根目錄，網站不會用到它。程式檔一律放 src/。`);
  }
}

// 2. 部署時（CI）金鑰必須存在，網址格式必須正確
if (process.env.CI) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
    errors.push("VITE_SUPABASE_URL 沒設定或格式不對（只能是 https://xxxx.supabase.co，後面不能有 /rest/v1/ 或斜線）。");
  }
  if (key.length < 20) errors.push("VITE_SUPABASE_ANON_KEY 沒設定。");
}

// 3. 建置後：產出的檔案裡要真的有 Supabase 網址，而且入口檔存在
if (process.argv.includes("--dist")) {
  const assets = path.join("dist", "assets");
  if (!fs.existsSync(path.join("dist", "index.html")) || !fs.existsSync(assets)) {
    errors.push("dist/ 沒有產出 index.html 或 assets。");
  } else {
    const js = fs.readdirSync(assets).filter((f) => f.endsWith(".js")).map((f) => fs.readFileSync(path.join(assets, f), "utf8")).join("\n");
    if (process.env.CI && !js.includes(process.env.VITE_SUPABASE_URL || "@@none@@")) errors.push("產出的程式裡找不到 Supabase 網址，金鑰沒有帶進去。");
    if (!js.includes("kv_store")) errors.push("產出的程式裡找不到 kv_store，資料存取層可能沒被打包。");
  }
}

if (errors.length) {
  console.error("部署前檢查沒過：\n" + errors.map((e) => "  ✗ " + e).join("\n"));
  process.exit(1);
}
console.log("部署前檢查通過" + (process.argv.includes("--dist") ? "（含建置產出）" : ""));
