# 交易手記｜Trading Journal

> **此來源對應正式網站第 85 版** · 更新日期：2026-10-02

[正式網站 tradersregion.com](https://tradersregion.com) · [第 85 版來源與更新說明](https://github.com/Bennn-code/trading-software-development/releases/tag/site-v85) · [完整更新紀錄](CHANGELOG.md)

「交易手記」是個人交易紀錄與表現分析網站，支援繁體中文、簡體中文、粵語及英文。記錄美股期貨、台指期、加密貨幣、美股現貨、台股、A 股及港股的已平倉交易，整理費用、損益、策略與交易心得，以明確公式產生統計與圖表。

本工具只記錄與分析，不下單、不自動交易、不撤單、不轉帳、不提款，也不保管交易所資產。正式網站的存取權限由既有部署設定控制；GitHub 原始碼與網站公開註冊是不同事項。

## 第 85 版更新

- **跨期統計分清楚**：本期已實現損益與平均交易／盈利／虧損持倉摘要，按使用者時區的出場日期計算；交易時段與持倉勝率圖按進場日期計算，僅納入截至現在已平倉且資料有效的交易。
- **歷史回撤與恢復延續**：本期最大回撤以本期期初零為起點；目前回撤、最長已完成恢復、尚未恢復時間與起始日期，追溯該交易帳號截至觀察截止的完整歷史。連敗明細區分本期最長、歷史最長及目前延續。
- **時間邊界與排序修正**：以原始交易時刻計算完整持倉長度，處理明確 UTC／偏移、秒／毫秒、夏令時間及期間終點；無效日期與不存在的本地時間不會成為有效樣本，同分鐘不同秒的結算維持正確順序。
- **保留第 84 版互動**：直方圖在柱體上方也能即時顯示提示，垂直十字線吸附柱體中心；持倉超過 48 小時會依實際時長繼續分組，例如 49h、50h、96h。

各版變更見 [CHANGELOG.md](CHANGELOG.md)。GitHub 既有提交紀錄保留；`site-v85` 使用網站部署版號，與早期 README 的 `V1.3` 說明、`package.json` 的套件版號分開。

## 主要功能

| 功能 | 目前行為 |
| --- | --- |
| 交易紀錄 | 手動新增／編輯／刪除，記錄商品、方向、帳號、進出場時間與價格、數量、費用、策略及心得；表格顯示進場時間、經過期間和費用明細。 |
| 截圖辨識 | 使用 OpenAI 讀取同一截圖的多筆交易；核對頁可修改、選帳號／時區、刪除特定交易及一次整批儲存。基本資料仍須完整，MAE／MFE 等選填項目可留白。 |
| CSV／Excel 匯入 | 搜尋平台、查看個別匯出教學、選檔、設定來源時區及市場、預覽核對後儲存；檔案與 API 名單分開顯示。 |
| 唯讀 API 匯入 | 已實作的平台提供一次性憑證欄位和日曆日期區間；伺服器只呼叫固定歷史查詢端點，先預覽再寫入紀錄。 |
| 重複提醒 | 相同或不同截圖中的同筆交易，依時間、進出場價格、盈虧等資料比對；紅色外框與文字提醒，框內維持原背景。允許重複錄入只確認一次；手動確認按鈕為綠色，整批匯入在儲存時確認一次。 |
| 交易總覽 | 損益、筆數、勝率、獲利因子、平均值、最佳／最差交易、累積淨損益與最近交易；固定響應式卡片版面。 |
| 交易狀態 | 緊湊文字摘要、市場／商品／策略比較及逐筆分析圖表，列有效樣本與統計說明。 |
| 常用功能 | 點星星收藏；側欄一級頁面直接顯示原卡片內容，未收藏為外框、收藏填黃，可直接取消。收藏按登入身分保存在目前瀏覽器，不跨裝置同步。 |
| 心得與策略 | 關鍵字搜尋、按日期查看逐筆策略／心得、只補寫文字；按需生成 AI 總結，生成期間有旋轉提示。 |
| 交易帳號 | 最多 8 個，可命名／改名、查看建立時間與筆數；交易、統計、心得與行情分析按帳號隔離。 |
| 顯示與統計偏好 | 時區、主要換算幣別、綠利紅損／紅利綠損、系統／明亮／黑暗外觀、示範資料開關及四語。重新載入沿用偏好，示範關閉時不先閃現示範交易。 |
| 資料匯出 | 完整 JSON 備份、總覽 CSV；支援的瀏覽器可選儲存位置，不支援則標準下載，取消另存不顯示成功。 |
| 隱私與帳號 | 設定內列資料權利操作、詳細隱私政策與關於我們；帳號註銷保留三次確認及先下載完整資料流程。 |

問號共用 `InfoTooltip`：手掌游標、懸停即顯示、支援鍵盤聚焦；選單與切換器共用懸停／焦點框線。自由排列、尺寸調整及所有恢復預設入口已移除。

## 匯入平台與支援程度

### CSV／Excel

目前有 **35 個平台教學項目**，搜尋與右側教學來自 [lib/broker-import.ts](lib/broker-import.ts)：

| 類別／地區 | 教學清單 |
| --- | --- |
| 加密貨幣 | BingX、Binance、Bitget、OKX、Bybit、MEXC、Pionex、Coinbase、KuCoin |
| 美國券商 | Webull、Fidelity、TradeStation、Firstrade、Robinhood |
| 台灣券商 | 元大證券、凱基證券、群益證券、玉山證券、國泰證券 |
| 香港券商 | 盈透證券（香港）IBKR Hong Kong、招商證券（香港）、華泰國際（香港）、長橋證券 |
| 中國券商 | 國投證券（原安信證券） |
| 跨地區／國際券商 | IBKR、Saxo、老虎證券、UBS 瑞銀 |
| 期貨／差價合約與平台 | NinjaTrader、eToro、TopstepX、FTMO、ProjectX、Tradovate、CMC Markets |

清單表示有官方來源的匯出教學及欄位讀取流程，**不表示每種帳戶、地區、報表都可直接匯入**。本工具需要完整已平倉交易；只有買賣成交、訂單、帳戶流水或 HTML 的報表，須按右側教學先配對進出場、轉成 CSV／Excel 並核對欄位。FTMO 依交易終端匯出；長橋使用 CLI；UBS 限特定證券報表格式；老虎證券已查證教學源自澳洲帳戶。日期限制及格式以各帳戶官方服務為準。

### API：已接通與教學清單分開

目前 **6 個伺服器唯讀串接已實作**，只有這些項目提供本站可用的 API Key／Secret 欄位，依平台另列 Passphrase：

| 已接通平台 | 本站讀取範圍 | 憑證 |
| --- | --- | --- |
| Bybit | USDT 線性合約／USDT 選擇權已平倉損益 | API Key、Secret |
| OKX | USDT 永續合約完整平倉歷史 | API Key、Secret、Passphrase |
| BingX | 指定 USDT 永續商品完整平倉歷史 | API Key、Secret |
| Bitget | USDT-M 期貨已平倉部位 | API Key、Secret、Passphrase |
| MEXC | USDT 合約完整平倉歷史 | API Key、Secret |
| KuCoin | UTA USDT-M 期貨已平倉部位 | API Key、Secret、Passphrase |

Bybit 線性歷史損益不提供完整最初開倉時間，預覽暫以平倉時間填入，**須核對並修正進場時間**才適合持倉／時段分析。各串接的現貨、反向合約、部分平倉、期間與筆數限制不同，見頁面說明及 [lib/api-import.ts](lib/api-import.ts)。

另外 **15 個項目僅整理官方 API 教學**，尚不是本站已接通的匯入器，不把憑證欄位當成可用連線：

| 狀態 | 清單 |
| --- | --- |
| 官方 API／唯讀報表教學，接頭未實作 | Binance、Pionex、Coinbase Advanced、BTCC、Tradovate、IBKR、盈透證券（香港）、Alpaca |
| 需開發者應用／授權設定，接頭未實作 | 長橋證券、Saxo、老虎證券 |
| 需本機終端／連接器，雲端網站未接通 | 富途 Futu、moomoo、永豐金證券 Shioaji、QMT／MiniQMT |

交易歷史匯入與 MAE／MFE 行情是不同功能。Binance 保留檔案與 API 教學，**目前不是 MAE／MFE 行情來源，也沒有本站已接通的 Binance 交易匯入器**。

## MAE／MFE：最大浮虧與最大浮盈

MAE 是持倉期間最大不利價格變動對應的浮虧，以負值顯示；MFE 是最大有利價格變動對應的浮盈。這些指標與最終已實現淨損益不同。

- 手動／截圖核對可填 MAE、MFE；未填仍可儲存基本資料完整的交易。只提供一側時仍顯示及統計，另一側留空。
- 加密交易有明確商品類型、時間、價格與部位單位，可在截圖核對背景補查或交易狀態分析。手動值優先，自動估算不改寫實際淨損益。
- 公開加密行情依 **OKX → Bybit → BingX** 查相同 USDT 交易對與現貨／永續，也可明確指定來源。跨所行情是參考估算，不等於使用者交易所的精確成交路徑。
- 成功數值、來源、週期、計算輸入與掃描進度保存到該交易帳號，重登直接顯示有效結果；新增只分析新增項目，掃完缺資料的組合不重掃。輸入修改使舊自動估算失效，手動值保留。
- 完整佇列以每段最多 3 筆、32 次行情請求處理，保留供應商全站每秒一次及使用者／IP 限額。限流、區域／授權拒絕會停止並顯示原因，重登不解除已保存拒絕；須明確續查／改選來源，不自動繞過限制。

### 部位計算依據

線性加密交易須明確選數量含義，不能只憑「全倉」或不明單位推定部位：

| 已確認資料 | 導出實際幣數 |
| --- | --- |
| 實際幣數 | 直接採已確認 base quantity |
| 進場名目倉位金額 | 進場名目金額 ÷ 進場價格 |
| 該筆進場保證金與槓桿 | 保證金 × 槓桿 ÷ 進場價格；須 USDT 永續及明確全倉／逐倉 |
| 完整平倉倉位金額 | 平倉 USDT 名目金額 ÷ 平均出場價；須完整平倉、持倉部位不變的線性交易 |

取得幣數後以價格差、方向及幣數估算金額，**不重複乘槓桿**。全倉帳戶餘額、維持保證金、不明合約張數與部分平倉小計不能當完整部位。股票使用有效股數，期貨使用有效口數與商品乘數；反向合約等未驗證公式不套用線性計算。

### 非加密行情與精度

| 行情來源 | 接線市場 | 程式提供週期 | 條件 |
| --- | --- | --- | --- |
| OKX／Bybit／BingX | USDT 現貨／永續 | 1m、5m、15m、30m、1h、4h、1d | 相同商品類型、完整持倉涵蓋、來源可用 |
| Fugle | 台股、台指期 | 1／5／15／30／60 分鐘、日線 | 有效金鑰及權限；期貨須確切合約月份 |
| Twelve Data | 美股、港股、A 股 | 1m、5m、15m、30m、1h、4h、1d | 有效金鑰、商品／市場權限 |
| Databento | CME 期貨歷史行情 | 1m、1h、1d | 有效金鑰／方案、確切合約月份與資料集權限 |

依供應商支援及持倉區間退補較粗週期；完整起訖不足或有不明盤中缺口時不製造估算。K 線高低價可能包含同桶未持倉時間，須標示區間近似；最大浮盈／浮虧出現時間只顯示 K 線區間及相對進場範圍，粗週期不能宣稱精確分鐘。手動極值沒有可靠時間證據則留空。

股票／期貨 adapter 已實作，仍須使用者有效行情授權與金鑰；公開小樣本及模擬測試不代表所有帳戶或全部私人交易已回補。行情金鑰只存本頁記憶體，以同源 HTTPS 送固定伺服器查詢，不永久保存、不進交易／瀏覽器儲存／備份／日誌，重載或離開後清除。使用前需確認供應商授權與可能費用。

## 統計口徑與圖表

| 分析 | 計算／顯示規則 |
| --- | --- |
| 已實現損益／本期摘要 | 按使用者時區的出場日期納入已平倉交易，週／月／季／年／自訂共用期間。平均交易／盈利／虧損時間使用完整出場減進場，獨立列有效樣本。 |
| 交易時段／持倉勝率 | 按進場日期歸屬，僅納入截至現在有效已平倉樣本。時段用進場小時；持倉未滿一小時按 5 分鐘分組，一小時以上按小時，最大值隨資料延伸。 |
| 勝率 | 獲利筆數 ÷ 有效交易筆數，打平在分母但不算獲利；最佳／最低只比較有交易分組。 |
| 回撤／恢復 | 只依已平倉損益，不含開倉浮盈虧／入出金。本期最大回撤期初零；目前回撤、恢復與延續連敗追溯完整帳號歷史，截止為期間結束與現在較早者。 |
| 策略偏好 | 分市場／整體顯示使用比例、筆數與分母，共用英文大小寫、全半形、繁簡及明確中文別名正規化，同筆同策略一次。 |
| 策略實際績效 | 橫向長條比較淨損益／每筆期望值，附筆數、勝率及樣本提醒。同筆多策略各歸因完整損益，重疊金額不可直接相加；沒有策略 R／期望 R。 |
| 商品做多／做空 | 分市場／幣別／商品比較平均每筆淨損益，交易筆數多的優先；分方向列勝率、總淨損益與平均值，先合計筆數再算勝率。 |
| 單筆淨損益分布 | 橫軸單筆淨損益、柱高筆數、打平獨立，附中位數／平均／極值。有效金額區間上方即可提示，垂直線吸附柱中心、水平線跟隨移動，沒有提示動畫。 |
| 獲利／虧損集中度 | 按單筆損益排序，正負各自累加，虧損柱在零線下；提示列單筆金額及單筆／累積占比，線平滑且不超越真實占比；不是依時間排列的資金曲線。 |
| MAE／MFE | 逐筆區間／點圖與保存淨損益並列，保留 0 線、十字線、點位提示；整體與市場摘要列各指標有效樣本、單側與缺漏。 |
| 浮盈保留率／由盈轉虧 | 有效 MFE>0 交易的「實際淨損益 ÷ MFE」平均；由盈轉虧是 MFE>0 且最終淨損益<0 筆數 ÷ MFE>0 樣本。不偷偷限制為 0～100%。 |

未知值以空值／橫線顯示，不當零。少於 5 筆的策略／商品提醒是介面提示，不是統計顯著性判定；長列表可顯示更多，完整表與統計仍包含全部有效交易。

### 費用、幣別與匯率

- 費用依市場顯示佣金、交易稅、印花稅、交易所／監管／清算／結算費或資金費，金額按對帳單輸入。支出負號，返佣／收到資金費正號。
- 未扣費損益扣已知費用；已提供淨損益不再扣一次，未知費用不假設為實際零費用。
- 預設原幣別，選主要幣別後逐筆換算，列幣別與未換算樣本；不混加 USD／USDT，也不把市場平均再平均。
- 匯率每小時快取／到期更新：法幣 ExchangeRate-API，USDT／USD Coinbase 公開 ticker；不假設 USDT=1 USD。過期、缺少或未驗證匯率不投入合計，保留原幣別。匯率不使用 OpenAI API。
- 整體平均 MAE／MFE 預設逐筆轉 USD 後按各指標有效樣本平均，選其他幣別才再轉。採有效目前報價，不是每筆成交當時的歷史匯率帳務。

## 技術架構與安全邊界

| 項目 | 技術／設計 |
| --- | --- |
| 前端 | React 19、TypeScript、Tailwind CSS、shadcn/ui、Recharts |
| 框架 | Vinext／Vite、App Router 結構，確切版本以 lockfile 為準 |
| 執行／儲存 | Cloudflare Workers 相容環境、D1、Drizzle SQL 遷移、R2 圖片 |
| AI | OpenAI 截圖辨識、交易對話及文字總結；可明確規則化的損益／統計用程式計算 |
| 登入 | Sites 身分驗證；電子郵件使用 Supabase Auth／HttpOnly Cookie，須完成服務及人機驗證設定 |
| 四語 | React LanguageProvider、英文／粵語詞典與 OpenCC 繁簡轉換 |
| 金融 API | 固定 HTTPS 主機、路徑、方法白名單，拒絕任意 URL／金融寫入端點及重新導向 |
| 請求／資料保護 | 來源檢查、輸入／檔案與回應大小限制、使用者／IP 限速、Turnstile、資料歸屬驗證及安全標頭 |
| 分析保存 | 伺服器原始交易為權威，owner／profile 隔離及並行變更檢查，避免舊分析覆蓋新交易 |

匯入憑證只供當次伺服器查詢，不存資料庫／瀏覽器持久儲存；供應商支援時仍須專用唯讀金鑰及 IP 白名單。端點限制不能取代憑證保護，也不承諾阻擋所有攻擊；安全、依賴及正式環境須持續驗證。設定細節見 [安全強化與後台設定](docs/security-hardening.md)。

## 本機開發

需要 **Node.js 22.13.0 以上**及 npm；乾淨 clone 預設可攜式設定，適用 Windows、macOS、Linux。

```sh
git clone https://github.com/Bennn-code/trading-software-development.git
cd trading-software-development
npm run install:ci
```

### 1. 環境變數

複製 `.env.example` 為 `.env`，按需要填自己的設定，未啟用功能保留空白：

```dotenv
OPENAI_API_KEY=
OPENAI_VISION_MODEL=gpt-4.1
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

真實金鑰不寫進 README／網址／日誌／前端 bundle／Git。沒有 OpenAI 金鑰仍可手動記錄，截圖辨識及總結需要有效金鑰與額度；行情金鑰在頁面一次性輸入。

電子郵件註冊見 [中文設定指南](docs/電子郵件註冊設定.md)。配置 Supabase email 驗證／SMTP 與 Turnstile，不需要 service-role key 或資料庫密碼。缺安全設定的功能會停用或拒絕請求；開發模擬登入不能替代正式驗證。

### 2. 建置與初始化本機資料庫

先產生本機 Worker 設定：

```sh
node scripts/run-framework.mjs build
```

以下依序套用 **0000～0007**，只供全新的本機資料庫；既有本機只套尚未執行的遷移。**不要對正式資料庫重跑初始化**，也不要清空資料。`0007` 保留歷史版面欄位，不重新啟用已移除的自由排列。

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_daffy_alex_wilder.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_foamy_johnny_blaze.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_medical_talisman.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_peaceful_network.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_perfect_puck.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_funny_kabuki.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0006_profiles_preferences.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0007_optimal_cannonball.sql
```

相對路徑若解析到其他位置，將 `--persist-to` 改為專案根 `.wrangler/state` 絕對路徑，確保與開發伺服器一致。正式遷移／資源綁定須由部署流程另外核對。

### 3. 啟動與驗證

```sh
npm run dev
```

預設 `http://localhost:5173`。`/signin-with-chatgpt?return_to=/` 是本機模擬登入，不是正式帳號驗證；開發資料與正式資料分開。

先建立忽略的 `work/` 資料夾，依序執行相關測試；部分案例共用暫存輸出，避免全部平行：

```sh
node node_modules/typescript/bin/tsc --noEmit
node tests/trades.test.mjs
node tests/trade-duplicates.test.mjs
node tests/broker-import.test.mjs
node tests/exchange-api-import.test.mjs
node tests/market-candles.test.mjs
node tests/mae-mfe-persistence.test.mjs
node tests/trade-performance.test.mjs
node tests/report-cohorts.test.mjs
node tests/histogram-hover.test.mjs
node tests/trade-status.test.mjs
node tests/trade-status-performance.test.mjs
node tests/language.test.mjs
node tests/language-render.test.mjs
node tests/security.test.mjs
node scripts/run-framework.mjs build
```

另對修改檔跑 ESLint，其他案例見 [tests/](tests/)。整合測試需已完成遷移的本機伺服器，可能新增／刪除測試交易或查詢網路；只在測試資料環境跑，不指向正式網站。建置警告與失敗須分開，SSR 圖表尺寸提醒不取代瀏覽器桌面／手機驗收。

## 目錄、部署與版本保存

```text
app/                  介面、共用圖表及伺服器 API
components/ui/        共用按鈕、選單、對話框
lib/                  損益、時間、匯入、行情、統計及安全
lib/locales/          翻譯與法律文字
db/、drizzle/         資料結構、SQL 遷移與快照
tests/                單元、元件、本機整合測試
scripts/              安裝、開發及建置輔助
docs/                 登入與安全設定指南
build/、vendor/       Sites 整合及第三方授權
.openai/hosting.json   既有 Sites 與儲存綁定
AGENTS.md             專案協作準則
roadmap.md            已確認需求及沿革
CHANGELOG.md          網站版本更新紀錄
```

正式網站沿用既有 Sites。GitHub 保存可追溯來源與文件，**推送程式不會自動部署網站，也不會備份雲端交易與私人截圖**。部署核對 build／封存／commit 一致，完成後核對版號與網址；協作前讀 [AGENTS.md](AGENTS.md) 和 [roadmap.md](roadmap.md)。

`.openai/hosting.json` 指向既有 Site，另建部署須配置自己的 D1／R2、秘密及可信身分驗證；不是直接當靜態頁的應用，不可相信任意客戶端自填登入標頭。公開註冊／存取須另外授權與驗證。

`.gitignore` 排除真實 `.env`、依賴、建置、本機資料庫與暫存；提交不得包含金鑰、token、正式交易或私人圖片，每次發布依實際秘密掃描核對。第三方授權保留在 `build/`、`vendor/`。

## English Summary

Trading Journal records and analyzes closed trades across crypto, U.S. and Taiwan futures, and U.S., Taiwan, mainland China and Hong Kong equities. This source corresponds to production website version 85 at [tradersregion.com](https://tradersregion.com); website access is controlled separately from this repository.

The app provides four languages, up to eight trading profiles, screenshot and CSV/Excel review, six implemented read-only exchange connectors, strategy and direction comparisons, drawdown/recovery summaries, and MAE/MFE estimates from authorized historical candles. Credentials are used only for fixed server-side queries; no order placement, transfers or withdrawals are implemented. Missing data remains unknown, and currencies are combined only with valid exchange rates.

Version 85 separates exit-date realized reporting from entry-date time analysis and preserves full-history recovery metrics, accurate timezone boundaries, immediate histogram tooltips with center snapping, and holding-time groups beyond 48 hours. See [CHANGELOG.md](CHANGELOG.md) for history. Node.js 22.13+ is required; follow the local setup and migration instructions above before running tests.
