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

// 雲端函式 my-bookings 用的是 src/coupons.js 的複本，兩份必須一樣（改規則忘了同步，客人看到的券就會跟後台不同）
const cpA = "src/coupons.js", cpB = "supabase/functions/my-bookings/coupons.js";
if (fs.existsSync(cpB) && fs.readFileSync(cpA, "utf8") !== fs.readFileSync(cpB, "utf8")) {
  errors.push(cpB + " 跟 " + cpA + " 不一樣。改完規則請複製過去，並重新部署 my-bookings 雲端函式。");
}

// LINE 登入（LIFF SDK）太舊時，LINE 會在客人按「用 LINE 登入」後直接顯示 400 Bad Request
// （2026-11-25 事故：2.31.0 被 LINE 停用，要求 2.31.1 以上）。看實際安裝/鎖定的版本，不是 package.json 的範圍。
const LIFF_MIN = "2.31.1";
function versionAtLeast(v, min) {
  const a = String(v).split(".").map(Number), b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return true;
}
try {
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const liffV = lock.packages?.["node_modules/@line/liff"]?.version;
  if (!liffV || !versionAtLeast(liffV, LIFF_MIN)) {
    errors.push(`LINE 登入套件 @line/liff 是 ${liffV || "未安裝"}，LINE 要求 ${LIFF_MIN} 以上，客人會登入失敗。請執行 npm install @line/liff@latest。`);
  }
} catch { errors.push("讀不到 package-lock.json，無法檢查 LINE 登入套件版本。"); }

if (errors.length) {
  console.error("部署前檢查沒過：\n" + errors.map((e) => "  ✗ " + e).join("\n"));
  process.exit(1);
}
console.log("部署前檢查通過" + (process.argv.includes("--dist") ? "（含建置產出）" : ""));
