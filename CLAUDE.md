# LUZ STYLE 髮廊管理系統 — 給 AI 的工作規則

這份只寫「不會過期的規則」和「怎麼查」。功能現況不要寫在這裡，要用查的。
使用者是髮廊老闆，不寫程式：說明用白話繁體中文，步驟越少越好。

## 1. 先查再答，不要憑記憶或舊文件
- 程式現況：看 `src/`。資料現況：查 Supabase。文件（含 docs/HANDOFF.md）寫的「已完成」只是當時的說法。
- 查得到的事不要問使用者，也不要請他截圖。
- 先分辨需求是「改資料」還是「改程式」。價格、服務項目、員工、商品都是資料，
  後台多半已有編輯畫面：先告訴使用者在哪裡改，他要你代勞再動資料庫。改資料不需要 GitHub token。

## 2. 連線資訊（一次要齊，不要來回）
- Supabase：專案 `wdpcuicryegjthyinftb`，在「MAMA」組織（不是 mar14ram）。
  專案清單是空的＝授權到錯的組織，請使用者重新連接並選 MAMA。
- GitHub：`mar14ram-del/LUZ-`，`main` 分支，推上去就自動部署。
  Token 權限：Contents 讀寫；要改 `.github/workflows/` 另需 Workflows 讀寫。
- 網址：後台 https://mar14ram-del.github.io/LUZ-/ ，預約頁加 `#/book`。

## 3. 「完成」的定義
改程式：`npm run check` 通過 → push → GitHub Actions 綠勾 → 才能說完成。
改資料：寫入後再讀一次確認 → 請使用者重新整理頁面。
沒做到的部分要明講「這部分沒驗證」，不可以只說完成。

## 4. 資料安全（最重要）
- `kv_store` 每個 key 是一整包 JSON。讀寫一律走 `src/storage.js`，不要自己寫 upsert。
- 不可以停用或繞過資料庫的 `kv_guard`（備份＋防誤蓋）。真的要大量刪除，先問使用者。
- 直接用 SQL 改 `kv_store` 時：只改需要的那一小段（jsonb_set），不要整包換掉。
- 員工、商品被記帳引用（staffId、materialId）。刪除或重建前先查有沒有帳指向它。
- 資料救回：`select id, replaced_at from kv_history where key = '…' order by id desc;`

## 5. 改程式的規矩
- 原始碼只放 `src/`。
- 修一個 bug，就在 `tests/` 加一個「修之前會失敗」的案例。
- 新增規則前先想：能不能改成自動檢查？能就寫進 `scripts/preflight.mjs` 或測試，不要寫成文字規則。
- 動手前先說做法與需要使用者決定的事；他確認後一路做到第 3 點的「完成」。

## 6. 每月健檢
執行 `db/health_check.sql`，把結果用白話報給使用者（孤兒帳、沒售價的商品、預約使用量）。
加新功能前，先看上一個功能有沒有人在用。
