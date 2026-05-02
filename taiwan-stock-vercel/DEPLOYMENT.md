# 🚀 台股技術分析 - Vercel 部署手把手教學

完整不用裝任何軟體，全程在瀏覽器操作。約 10 分鐘完成。

---

## 📋 你需要的東西

1. 一個 Email（用來註冊 GitHub）
2. iPhone（用來最後查看）
3. 一台電腦或平板（用來操作 GitHub 與 Vercel 介面，手機螢幕太小不便）

---

## 🌟 步驟 1：註冊 GitHub 帳號（3 分鐘）

GitHub 是放程式碼的地方。

1. 用瀏覽器打開 https://github.com/signup
2. 輸入：
   - Email
   - 設定密碼
   - 設定 Username（任意英文 + 數字，例如 `joe2024`）
3. 完成驗證（會寄信到你 email 確認）

**完成後不用做任何其他事**，直接進下一步。

---

## 📦 步驟 2：把專案上傳到 GitHub（3 分鐘）

1. 登入 GitHub 後，點右上角 `+` → `New repository`
2. **Repository name** 填：`taiwan-stock`
3. **Public**（公開，免費版只能用 Public）
4. **不要勾**任何「Add README」「.gitignore」等選項
5. 點下方綠色按鈕 **Create repository**

接下來會看到一個空的 repo 頁面，往下滑找到這段：

> **uploading an existing file**

點這個連結 → 進入上傳頁面 → 把 **本地解壓縮後的整個 `taiwan-stock-vercel` 資料夾的內容**（不是資料夾本身，是裡面的檔案）拖進去：

需要上傳的檔案/資料夾：
```
api/finmind.js
api/yahoo.js
api/chip.js          ← 新增！三大法人籌碼資料
src/main.jsx
src/App.jsx
index.html
package.json
vercel.json
vite.config.js
```

下方填一個 commit message（隨便填，例如 `init`），點綠色按鈕 **Commit changes**。

---

## ⚡ 步驟 3：用 Vercel 部署（3 分鐘）

1. 打開 https://vercel.com/signup
2. 點 **Continue with GitHub**（用剛剛的 GitHub 帳號登入）
3. 同意授權
4. 進入 Vercel Dashboard 後，會看到「Import Git Repository」
5. 找到剛剛建立的 `taiwan-stock` repo，點 **Import**
6. 全部設定**保持預設**，直接點下方藍色按鈕 **Deploy**
7. 等 30 秒～1 分鐘建置完成

完成後會看到 🎉 慶祝頁面與一個網址，類似：
```
https://taiwan-stock-xxx.vercel.app
```

點那個網址 → **真實股價儀表板出現了！**

---

## 📱 步驟 4：iPhone 加到主畫面（1 分鐘）

把網址變成像 App 的圖示：

1. iPhone Safari 打開那個 Vercel 網址（例如 `https://taiwan-stock-xxx.vercel.app`）
2. 點下方**分享按鈕** ⬆️（方框加箭頭）
3. 往下滑，找到 **加入主畫面**
4. 改名稱（例如「台股分析」）→ 點 **加入**

主畫面就會多一個圖示，點下去**就像 App 一樣全螢幕打開**！

---

## ✅ 完成

現在你有：
- 永久的網址 `https://taiwan-stock-xxx.vercel.app`
- iPhone 主畫面圖示，打開就用
- 真實的台股即時行情（FinMind + Yahoo Finance）
- 完整 K 線圖、技術指標、AI 分析

---

## 🔄 之後要改程式碼怎麼辦？

直接到 GitHub 編輯檔案 → 儲存 → Vercel 會**自動偵測 + 自動重新部署**（約 1 分鐘）。

---

## ❓ 疑難排解

### Vercel 部署失敗
- 確認 `package.json`、`vercel.json`、`api/` 資料夾都有上傳
- 點 Deployment 看 Build Logs，把錯誤訊息回報

### 找不到股票
- 確認代碼正確（如 2330、2337）
- 興櫃股票不一定有資料

### 網址打開很慢
- 第一次打開或長時間沒用 Vercel 會「冷啟動」，約 2-3 秒
- 之後就很快了

---

## 💸 費用？

**完全免費**！

- GitHub Public repo 免費
- Vercel Hobby 方案免費（個人使用綽綽有餘）
- FinMind 公開 API 免費

只要你不是流量爆炸（每月 100GB 以內），永遠不會收費。
