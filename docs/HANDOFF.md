# LUZ STYLE 髮廊管理系統 — 開發紀錄（交接用）

> 最後更新：2026-11-03，對應版本 commit `7528144`（之後的修改請接著往下記）。
> 新對話開始時，請先讀完這份再動手。

---

## 1. 基本資訊

| 項目 | 內容 |
|---|---|
| GitHub | `mar14ram-del/LUZ-`（公開 repo，`main` 分支） |
| 後台 | https://mar14ram-del.github.io/LUZ-/ |
| 客人預約頁 | https://mar14ram-del.github.io/LUZ-/#/book |
| 技術 | React + Vite、Supabase（PostgreSQL + Edge Functions）、GitHub Pages（GitHub Actions 自動部署） |
| Supabase 專案 | ID `wdpcuicryegjthyinftb`（顯示名稱「記帳財務」） |
| LINE 官方帳號 | `@869brjqy`（Luz-Style）＝ Messaging API channel，ID `2011350178`，負責推播通知 |
| LINE Login channel | ID `2011350495`，LIFF ID `2011350495-Nsh4G20W`（寫死在 `src/booking-public.jsx`），負責客人登入 |
| Edge Function Secret | `LINE_CHANNEL_ACCESS_TOKEN`（Messaging API 的 token，`notify-line` 與 `my-bookings` 共用） |
| 分店 | `luz`（LUZ，桃園中山路）、`ali`（阿麗，蘆竹）。設定在 `src/stores.jsx` |

---

## 2. 工作規則與雷點（一定要遵守）

- **所有原始碼都放在 `src/`，不要放到根目錄**（以前踩過坑）。
- `.github/workflows/` 底下的檔案，使用者的 GitHub token 沒有權限，**要請使用者自己手動改**。
- 使用者的電腦**沒有 Node.js、也沒有 Python**，本機跑不了 `npm run build`。
  改完 → commit → push → 用下面的指令輪詢 GitHub Actions，看到 `success` 才算建置通過：
  ```
  curl -s "https://api.github.com/repos/mar14ram-del/LUZ-/actions/runs?per_page=1" | grep -E '"head_sha"|"status"|"conclusion"'
  ```
  因為沒有本機建置，**每次改完都要人工檢查有沒有未定義的變數或函式名稱打錯**（語法檢查抓不到這種錯）。
- 部署後畫面沒變：多半是瀏覽器快取（請使用者按 Ctrl+Shift+R），或建置失敗（去 GitHub Actions 看紅叉）。
- 資料庫變更：用 Supabase MCP 的 `apply_migration`。偶爾會被安全機制擋下，擋下時就把 SQL 整理好給使用者貼到 Supabase SQL Editor 執行。
- 使用者（髮廊老闆，非技術背景）的協作習慣：
  - 說明要白話、避免術語。
  - **動手前先說明做法、列出要他決定的地方**，需要時先出示意圖；他確認後（常說「直接幫我處理」「照建議」「執行並上傳」）就**一路做到 push 並確認 GitHub Actions 綠勾**，不要每一步都回頭問。
- 原有既定做法：設計師只有一條時間軸、不分店，所以不可能重複預約；**分店只是預約上的標籤，不是隔離維度**。

---

## 3. 檔案地圖（`src/`）

| 檔案 | 用途 |
|---|---|
| `App.jsx` / `main.jsx` / `Login.jsx` | 路由（`#/book` 是客人預約頁）、後台登入 |
| `booking-public.jsx` | **客人預約頁**：LINE 登入蒙版、我的預約、依分店／依設計師預約、選服務、選時段、送出 |
| `booking-admin.jsx` | 後台「待確認預約」收件匣：確認／退回、LINE 確認推播、指定／不指定標示 |
| `booking-sync.jsx` | 把空檔發布到 `public_availability` / `public_config`（後台開著時自動同步） |
| `salon-appointments.jsx` | 後台**預約管理**（班表、預約、服務與設定、客人取消同步提醒） |
| `rotation.jsx` | 後台「不指定設計師的排班表」編輯器（在「服務與設定」裡） |
| `roster.jsx` | 設計師班表、設計師公開資料 |
| `services.jsx` | 服務項目與價目（分級、加價項）、價目編輯器 |
| `salon-customers.jsx` | 後台**顧客資料** |
| `import-customers.jsx` | 顧客 CSV 批次匯入工具 |
| `FinanceApp.jsx` | **財務帳本**：總覽、記帳（含每日業績）、物料、員工薪資、每日結帳、報表 |
| `payroll-lock.jsx` | 薪資頁密碼鎖 |
| `storage.js` | 讀寫 Supabase `kv_store` 的共用層（含 `window.storage`） |
| `stores.jsx` | 分店與品牌名稱來源 |
| `supabaseClient.js` | Supabase 連線（金鑰來自 GitHub Actions secrets 的環境變數） |

根目錄 `supabase-schema.sql` 只記了部分 SQL（`kv_store` 與「卡住時段」那段），**不是完整的資料庫結構**，以實際資料庫為準。

---

## 4. 資料存放

### `kv_store`（key → 一整包 JSON，後台登入後才能讀寫）
`customers:list`、`appointments:list`、`appointments:services`、`appointments:settings`、`appointments:roster`、
`finance:transactions`、`finance:staff`、`finance:materials`、`finance:closings`、
`finance:assistantItems`、`finance:designerDeductions`、`finance:staffItemTemplates`、`finance:payrollLock`

> 注意：每個 key 是整包讀寫。顧客匯入 7021 筆後 `customers:list` 約 4 MB，每次改一位顧客就會整包重寫。

### 資料表 / 檢視表
| 名稱 | 說明 |
|---|---|
| `booking_requests` | 客人送出的預約申請。狀態：`pending` / `approved` / `rejected` / `cancelled`。重要欄位：`staff_requested`（有沒有指定設計師）、`assign_note`（不指定時系統排給誰的說明）、`line_user_id`、`appointment_id`（確認後綁定的班表預約 id）、`cancelled_at`、`cancel_synced` |
| `public_availability` | 每天每位設計師在哪家店、有哪些空檔（由後台發布） |
| `public_config` | 公開設定：分店、服務、設計師公開資料、時段刻度 |
| `booking_rotation` | 不指定設計師的排班表：每個服務項目一列，`staff_ids`（有序名單，null＝全部參加）、`next_staff_id`（下一位）、`credits`（{設計師id: +次數}） |
| `public_hold_slots`（檢視表） | 給預約頁讀的「被待確認申請卡住的時段」，不含個資 |
| `public_rotation_lists`（檢視表） | 給預約頁讀的「每個項目哪些設計師參加排班」 |

### 函式 / 觸發器（都掛在 `booking_requests` 的 INSERT 前）
1. `trg_a_assign_designer` → `assign_designer_for_request()`：不指定時依排班表排人（名稱以 `trg_a` 開頭確保先執行）
2. `trg_block_overlapping_booking_request` → `block_overlapping_booking_request()`：同設計師同時段已有待確認申請就擋下（錯誤訊息 `slot_already_taken`）
- `designer_can_take(...)`：判斷某設計師能不能接（會做全部項目、當天在該店、時段空、沒被卡住）

### Edge Functions
| 名稱 | verify_jwt | 用途 |
|---|---|---|
| `notify-line` | true | 後台確認預約時推播 LINE 給客人 |
| `my-bookings` | **false**（自己驗身分） | 客人的「我的預約」：`list` / `cancel`。先用 LIFF access token 向 LINE 驗證（client_id 必須是 `2011350495`），只回傳本人的預約；取消後推播取消通知 |

---

## 5. 功能現況

### 客人預約頁（`#/book`）
- **首頁 LINE 登入霧面蒙版**：還沒登入時跳出；按「先不用」這次瀏覽不再跳（sessionStorage `luz_line_veil_skipped_v1`）。
- **我的預約**：登入後首頁最上方顯示下一次預約；可看即將到來的預約（待確認／已確認／未成立）、導航到店、**自行取消**（按兩次確認）、連到官方帳號聊天。
- **依分店預約**：選分店 → **想找哪位設計師？**（預設「不指定」，或指定該店設計師，不顯示有空時間）→ 選服務 → 選時段 → 填資料。
- **依設計師預約**：選設計師 → 服務 → 時段（顯示當天在哪家店）→ 資料。
- 不指定時，只顯示「有參加該項目排班的設計師」有空的時段，畫面不寫設計師名字。
- 送出後時段立刻被卡住，別人選不到也送不出。

### 後台預約
- 收件匣卡片標示「**指定 X**」或「**不指定**」＋「依『染髮』排班表輪到 Paul」，可改派。
- 確認時：硬性擋重複時段、建立班表預約、記錄 `appointment_id`、推播 LINE 確認。
- 「服務與設定」裡有**不指定設計師的排班表**（加入／移出、排序、設為下一位、調整 +次數）。
- 客人線上取消「已確認」預約時，後台開啟時會自動把班表那筆改成「已取消」並顯示紅色提醒（約每 3 分鐘檢查一次）。

### 顧客資料
- 「匯入 CSV」工具：電話比對、只補空白欄位、同人合併、加「舊資料匯入」標籤。
- 清單一次最多顯示 300 筆，其餘用搜尋。

### 財務帳本
- **記帳**：分類可複選、價格分級用按鈕、合計自動加總；每筆有**鉛筆可單獨編輯**；記帳頁上方有**每日業績**（每位設計師當日筆數、業績、預估抽成、本月累計，點名字只看他那天的記帳）。
- **物料**：品牌／售價欄位、庫存下拉快速調整。
- **員工薪資**：可選月份（每月 1～10 號預設上個月）；設計師與助理都有獎金／扣款項目；薪資支出記在**該月最後一天**。
- **每日結帳**：當日收入依付款方式（現金、信用卡、行動支付、銀行轉帳）分開列；現金清點只算現金。
- 「今天」一律用台灣時間（不再用 toISOString）。

---

## 6. 重要商業規則

- **不指定設計師輪流排人**：依客人**第一個選的項目**的排班表，從「下一位」開始輪；被排到的人在客人選的**其他項目**的表 +1，下次在那張表輪到他時跳過一次並扣 1；忙碌的人跳過但不扣次數；排到的人必須在客人選的每個項目的名單裡（沒設定的項目＝全部參加）。
- **產品銷售算給設計師的業績**＝實收 − 定價 × 5 折 × 數量（6 折賣出時剛好是定價一成）；舊紀錄沒記商品時以「實收 ÷ 6」估算。
- **設計師抽成**＝服務業績扣基本物料 % 後 × 抽成 %，再加上產品差價（整筆歸設計師）。每日業績與薪資頁用同一套算法（`designerPerformance()`）。
- **庫存連動**：產品銷售會記下 `materialId` 與 `qty`；整筆刪除、刪掉產品品項、換商品或改數量會自動調整庫存；只改金額不動庫存。2026-10 以前的 7 筆產品銷售沒記商品，不會自動調整。
- 改到已結算薪資的月份會提醒「抽成不會自動補發或扣回」。

---

## 7. 尚未完成 / 待確認

1. **LINE Login channel 必須改成「Published」**：使用者測試時出現「This channel is now developing status」，代表 channel `2011350495` 還在開發中，一般客人登不進來。要在 LINE Developers Console → 該 LINE Login channel → 點 Developing → Publish。最後一次對話時使用者還在找這個 channel，**不確定是否已完成**。
2. 建議在 LIFF 設定「Add friend option」設為 On (Aggressive)，否則沒加官方帳號好友的客人收不到 LINE 通知。
3. 「我的預約」與自行取消**還沒用真實 LINE 帳號完整測過**（要等第 1 點完成）。
4. 顧客 CSV 匯入（7021 筆）工具已上線，**使用者是否已實際匯入未確認**。檔案 `客戶資料_7021筆.csv` 曾傳給使用者。
5. 客人取消已確認的預約後，要等後台「預約管理」打開才會同步班表並釋放公開時段。
6. 「每日業績」目前只能在財務帳本裡看（會看到所有人）；曾討論過「設計師用自己手機 LINE 登入只看自己」的做法，尚未決定。

---

## 8. 本機工作副本

這台電腦上的 clone 在 `C:\Users\user\luz-tmp`（已設定 `git config --global core.longpaths true`，否則 Windows 會因路徑太長 clone 失敗）。開始改之前先 `git pull`，因為使用者也會從別的地方 push。
