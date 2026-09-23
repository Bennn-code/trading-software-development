# 交易軟體開發

> **最新版本：V1.3** · [查看版本紀錄與更新內容](https://github.com/Bennn-code/trading-software-development/releases/latest)

提供繁體中文、簡體中文、英文與粵語的個人交易紀錄網頁，產品名稱為「交易手記」。用來記錄美國期貨與加密貨幣的已平倉交易，整理截圖、損益及交易心得。

本專案是交易日誌，不會連線到券商下單，也不保管交易所資產。

## 主要功能

- **交易紀錄**：手動新增、編輯與刪除，支援商品、方向、帳戶、進出場時間、平均價格、策略與心得。
- **截圖辨識**：使用 OpenAI 辨識同一張截圖中的多筆交易；可逐筆修改、勾選核對，再一次儲存。未明示的費用保持未知，策略可以留白。
- **重複防護**：檢查相同截圖，以及不同截圖中時間、價格、倉位大小、盈虧等資料一致的交易。重複資料標紅、預設略過，依序確認兩次才允許另存。
- **損益計算**：區分未扣費盈虧與已扣費淨盈虧，處理佣金、交易費、返佣及資金費，避免重複扣費。
- **加密貨幣倉位**：以倉位金額記錄，支援槓桿及全倉／逐倉模式，估算初始保證金。
- **交易總覽**：總損益、今日與本週損益、各市場與合計筆數、各幣別與總勝率、獲利因子、平均獲利／虧損、最佳／最差交易及最忙碌交易日。
- **期間篩選**：週、月、季、年與自訂日期；上方選擇器、圖表和交易清單共用期間。
- **匯率換算**：USD 與 USDT 保留原幣別統計，另以每日快取匯率折合 USD；行情來源為 CoinGecko 公開服務。
- **視覺化與匯出**：紅綠雙色累積淨損益、0 參考線、損益日曆、CSV 匯出與原始截圖查看。
- **心得與 AI 總結**：整理每週、每月與年度交易心得，按需生成 AI 回顧。
- **深淺模式**：記住外觀選擇，深色模式使用深炭灰底、獲利綠字與虧損紅字。
- **我的交易空間**：點擊左下角個人區或上方同名入口，設定顯示語言；登入後保存至帳號，未登入時保存在瀏覽器。
- **電子郵件帳號**：自訂密碼、信件驗證碼、重寄、登入與登出介面及服務已備妥；須設定 Supabase 與寄信服務後才會啟用。原有 ChatGPT 登入及紀錄保留，兩種帳號須明確確認才連結。

## 統計規則

- 僅統計已平倉交易；時間以台北 UTC+8、24 小時制顯示。
- 週統計為週一至週日，包含跨月交易；圖表按出場時間累計。
- 未扣費盈虧會再扣除已知的佣金、交易費與支付資金費；已填寫的淨盈虧不再扣一次。
- 未知費用不會被推測成實際零費用；統計只扣除已知費用。
- 初始保證金估算為「進場倉位金額 ÷ 槓桿」，不代表全倉帳戶的實際資金占用或最大風險。
- 自動計算適用已設定乘數的期貨與線性加密交易；反向合約等情況可直接填入帳單損益。
- 合併損益採目前有效的每日匯率，並非各筆交易成交時的歷史匯率；沒有有效報價時不假設 USDT 等於 1 USD。
- 示範資料為虛構；從示範頁新增或匯入交易仍保存到「我的紀錄」。編輯示範交易只影響本次瀏覽。

## 技術架構

| 項目 | 技術 |
| --- | --- |
| 前端 | React 19、TypeScript、Tailwind CSS、shadcn/ui |
| 網頁框架 | Vinext、Vite，採用 App Router 目錄結構 |
| 執行環境 | Cloudflare Workers 相容環境 |
| 資料庫 | Cloudflare D1、Drizzle 結構與 SQL 遷移 |
| 截圖儲存 | Cloudflare R2 |
| AI | OpenAI API，預設截圖模型為 `gpt-4.1` |
| 登入與現有部署 | Sites 平台提供的 ChatGPT 身分驗證與私密存取 |
| 電子郵件帳號 | Supabase Auth、HttpOnly Cookie；未配置時明確停用 |
| 多語介面 | React 語言 Context、英文詞典、OpenCC 繁簡轉換 |

## 本機開發

需要 Node.js **22.13.0 以上**及 npm。乾淨複製的專案預設使用可攜式開發設定，適用 Windows、macOS 與 Linux。

```sh
git clone https://github.com/Bennn-code/trading-software-development.git
cd trading-software-development
npm run install:ci
```

### 1. 設定環境變數

將 `.env.example` 複製成 `.env`，填入自己的設定：

```dotenv
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-4.1
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

金鑰只供伺服器使用，不能放到瀏覽器程式碼或提交到 Git。沒有金鑰時仍可手動記錄交易；截圖辨識與 AI 總結需要有效金鑰及 API 額度。匯率查詢不使用 OpenAI。

電子郵件註冊請依 [中文設定指南](docs/電子郵件註冊設定.md) 建立 Supabase 專案、開啟 Confirm email、設定驗證碼信件及 SMTP。使用 Publishable key 即可，無需資料庫密碼或 service-role key。Sites 仍保留原有私密存取範圍，新增電子郵件登入不會自行開放網站。

### 2. 建置與初始化本機資料庫

先執行建置，以產生本機 Worker 設定：

```sh
npm run build
```

在專案根目錄依序執行以下 SQL。這些指令只操作本機資料庫；既有資料庫只套用尚未執行的遷移，不要重複初始化。

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_daffy_alex_wilder.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_foamy_johnny_blaze.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_medical_talisman.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_peaceful_network.sql
```

若工具把相對資料夾解析到其他位置，請把 `--persist-to` 改成專案根目錄下 `.wrangler/state` 的**絕對路徑**，確保與開發伺服器使用同一份資料庫。

### 3. 啟動開發網站

```sh
npm run dev
```

預設開啟 `http://localhost:5173`。本機可透過 `/signin-with-chatgpt?return_to=/` 使用模擬登入；模擬登入只供本機開發，不會包含在正式版本中。

## 檢查與測試

```sh
npx tsc --noEmit
node tests/trades.test.mjs
node tests/periods.test.mjs
node tests/dashboard.test.mjs
node tests/reporting.test.mjs
node tests/trade-duplicates.test.mjs
npm run build
```

部分單元測試會在忽略的 `work/` 資料夾產生暫存檔；第一次執行前，若該資料夾不存在，請先建立。測試依序執行即可。

需要啟動本機開發伺服器及套用資料庫遷移後，才執行整合測試：

```sh
node tests/reporting.integration.mjs
node tests/batch.integration.mjs
node tests/duplicate.integration.mjs
node tests/trade-duplicates.integration.mjs
```

整合測試預設使用 `http://localhost:5173`，部分測試會建立並清除本機測試紀錄；匯率檢查需要網路。

## 目錄說明

```text
app/                  網頁介面、樣式及伺服器 API
components/ui/        共用介面元件
lib/                  損益、期間、AI 辨識與重複交易比對
db/                   資料庫結構
drizzle/              SQL 遷移與結構快照
tests/                單元測試及本機整合測試
scripts/              安裝、開發、建置輔助程式
build/                Sites 開發整合
public/               靜態圖示
.openai/hosting.json   現有 Sites 專案與 D1／R2 綁定設定
```

## 部署與資料保護

目前正式網站部署在 Sites，登入、D1、R2 與秘密設定由該平台提供。上傳到 GitHub 是保存原始碼，**不會自動部署網站，也不會備份雲端的個人交易資料與截圖**。

`.openai/hosting.json` 連結既有網站；部署新的獨立網站時，應透過平台建立自己的專案與儲存資源。若改用其他平台，需要另外配置 D1／R2 及可信任的身分驗證，不能只把本專案當成靜態頁面部署，也不能直接信任使用者自行傳入的登入標頭。

`.gitignore` 已排除實際 `.env`、依賴套件、建置輸出、本機資料庫及暫存檔。本儲存庫不包含 API 金鑰、正式交易資料或私人交易截圖。第三方元件授權檔保留在 `build/` 與 `vendor/`。
