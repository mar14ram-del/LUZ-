# 髮廊財務系統 — 部署到 GitHub Pages

這是財務模組的獨立網站版本，手機、電腦都能直接用網址開，不需要透過 Claude。
資料存在 Supabase（免費雲端資料庫），需要帳號密碼登入才看得到資料。

## 一、建立 Supabase 專案（存資料用）

1. 到 https://supabase.com 註冊、建立一個新專案（免費方案就夠用）。
2. 進到專案後，左側選單點「SQL Editor」，貼上 `supabase-schema.sql` 的全部內容，按「Run」執行一次。
3. 左側選單點「Authentication」→「Users」→「Add user」，用你自己的 email 建一個帳號，設一組密碼。這就是你之後登入網站要用的帳號。
   - 左側「Authentication」→「Providers」，確認 Email 是開啟的；「Settings」裡把「Allow new users to sign up」關掉，避免陌生人自己註冊。
4. 左側選單點「Project Settings」→「API」，把「Project URL」和「anon public」這兩個值記下來，等一下會用到。

## 二、本機測試（確認能跑再上傳）

需要先安裝 Node.js（建議 20 版以上）。

```bash
cd salon-app
npm install
cp .env.example .env
```

打開 `.env`，把剛剛記下的兩個值貼進去：

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxxxxxxxxxxxxxxxxxxxx
```

然後：

```bash
npm run dev
```

瀏覽器打開它顯示的網址（通常是 http://localhost:5173），應該會看到登入畫面，用剛剛建立的帳號密碼登入，確認財務系統能正常打開、記帳存得進去。

## 三、上傳到 GitHub

1. 到 https://github.com 建立一個新的 repository（例如取名 `salon-app`），設定成 Private（比較安全，公開的話任何人都看得到你的程式碼，雖然看不到資料）。
2. 在 `salon-app` 資料夾裡執行：

```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/你的帳號/salon-app.git
git push -u origin main
```

（`.env` 已經被 `.gitignore` 排除，不會被上傳，金鑰不會外流。）

3. 開啟 repo 的「Settings」→「Secrets and variables」→「Actions」，新增兩個 Repository secrets：
   - `VITE_SUPABASE_URL` = 你的 Project URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 anon public key

4. 開啟 repo 的「Settings」→「Pages」，「Source」選擇「GitHub Actions」。

5. 確認 `vite.config.js` 裡的 `base` 跟你的 repo 名稱一致，例如 repo 叫 `salon-app` 就要是：

```js
base: "/salon-app/",
```

如果不一致，改完要重新 commit、push 一次。

6. 之後每次 `git push` 到 `main`，GitHub Actions 就會自動建置並部署。第一次 push 完，到 repo 的「Actions」分頁看進度，跑完後網站網址會是：

```
https://你的帳號.github.io/salon-app/
```

打開就會看到登入畫面。手機上可以把這個網址加到主畫面，就像一個 App 一樣。

## 之後要更新內容

改完程式碼後：

```bash
git add .
git commit -m "說明這次改了什麼"
git push
```

GitHub Actions 會自動重新部署，通常 1-2 分鐘後網站就會更新。

## 之後要加回顧客模組或其他模組

這次先只上線財務部分。之後如果要把顧客資料模組也放進來，只要：
1. 把顧客模組的程式碼也改成用 `src/storage.js`（做法跟財務模組一樣）。
2. 放進 `src/CustomerApp.jsx`。
3. 在 `src/App.jsx` 加一個切換頁籤，兩個模組會自動共用同一個 Supabase 帳號和資料庫（用同一套 key 命名規則就能互通，例如財務模組已經在用的 `finance:staff`）。

跟我說一聲，我可以幫你把這部分接上去。
