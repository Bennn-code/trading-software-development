import type { BrokerRegion } from './broker-import';
import type { Trade } from './trades';

export type ApiImportGuide = {
  id: string;
  name: string;
  category: '加密貨幣' | '期貨／差價合約' | '證券';
  market: Trade['market'];
  markets?: Trade['market'][];
  region: BrokerRegion;
  keywords?: string[];
  source: string;
  credentialType: 'API Key + Secret' | 'API Key + Secret + Passphrase' | '唯讀 OAuth' | 'Flex Token + Query ID' | '本機 OpenD' | '本機交易終端／OpenD';
  /** Distinguishes a provider-issued read scope from providers whose APIs also expose financial write operations. */
  safetyMode?: 'provider-read-only' | 'site-query-only';
  readPermission: string;
  steps: string[];
  notes?: string[];
  availability?: 'normal' | 'external-setup' | 'local-only';
  /** A site-side connector that accepts one-time credentials and implements fixed read endpoints. */
  liveConnector?: 'bybit-options';
};

/**
 * API-capable platforms are catalogued separately from file exports. The catalog
 * only includes official account-history APIs with a read-only permission path.
 * liveConnector means a fixed site-side adapter exists; the rest are catalog-only
 * and must never accept credentials as if they were connected.
 */
export const apiImportGuides: ApiImportGuide[] = [
  {
    id: 'binance', name: 'Binance', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['幣安'],
    source: 'https://developers.binance.com/en/docs/products/spot/rest-api', credentialType: 'API Key + Secret', readPermission: '只開啟讀取權限；停用 Spot／Futures Trading、Withdrawals 與 Transfer。',
    steps: ['登入 Binance，前往 API Management／API 管理。', '建立專用 API Key，只允許讀取帳戶與交易紀錄。', '確認交易、提款、轉帳權限皆關閉，再使用日期範圍查詢。'],
    notes: ['Binance 現貨歷史成交查詢通常需要指定交易對；API 的可查期間與頻率受交易所規則限制。'],
  },
  {
    id: 'bybit', name: 'Bybit', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['拜比特'],
    source: 'https://bybit-exchange.github.io/docs/v5/position/close-position', credentialType: 'API Key + Secret', readPermission: '此串接只會向固定的已平倉選擇權查詢端點發送 GET；仍請在 Bybit 將 API Key 設為 Read-Only，關閉 Trade、Transfer 和 Withdraw。',
    steps: ['登入 Bybit API Management／API 管理，建立專用 API Key。', '權限只選 Read-Only，關閉 Trade、Transfer、Withdraw；如可設定 IP 白名單，請依 Bybit 建議設定。', '在本站輸入 API Key 和 Secret，選擇日期區間後讀取已平倉 USDT 選擇權。', '先逐筆核對預覽資料，再勾選並按儲存；本站目前不讀取現貨或其他合約類型。'],
    notes: ['本站目前只支援 Bybit USDT 選擇權已平倉紀錄，API 最多查詢最近六個月；每次最多預覽 50 筆。金鑰只用於當次伺服器查詢，不會寫入資料庫或瀏覽器儲存。'],
    liveConnector: 'bybit-options',
  },
  {
    id: 'okx', name: 'OKX', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['歐易'],
    source: 'https://www.okx.com/docs-v5/en/', credentialType: 'API Key + Secret + Passphrase', readPermission: '只選 Read；不可選 Trade 或 Withdraw。建議依 OKX 指引綁定 IP。',
    steps: ['登入 OKX，前往 API／API 管理並建立專用金鑰。', '權限只選 Read，關閉 Trade 和 Withdraw，設定 API Passphrase。', '選擇日期區間與產品類型；官方歷史成交 API 有各自資料保留期限。'],
    notes: ['OKX API 會要求 API Key、Secret 和 Passphrase；只提供唯讀權限。'],
  },
  {
    id: 'bingx', name: 'BingX', category: '加密貨幣', market: 'crypto', region: 'crypto',
    source: 'https://github.com/BingX-API/api-ai-skills/blob/main/skills/references/authentication.md', credentialType: 'API Key + Secret', readPermission: '只允許查詢資料；關閉交易與提款權限。',
    steps: ['登入 BingX，開啟 API Management／API 管理。', '建立只讀 API Key，確認不能下單、取消委託、轉帳或提款。', '選擇日期區間和市場，再查詢帳戶成交紀錄。'],
    notes: ['BingX 不同現貨、永續合約 API 的歷史資料欄位及期間不同。'],
  },
  {
    id: 'bitget', name: 'Bitget', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['Bitget'],
    source: 'https://www.bitget.com/api-doc/common/intro', credentialType: 'API Key + Secret + Passphrase', readPermission: '選 Read-Only；不可啟用 Trade、Transfer 或 Withdraw。',
    steps: ['登入 Bitget，前往 API Key 管理。', '建立專用 API Key，權限選 Read-Only，設定 Passphrase。', '確認交易、轉帳、提款權限全部關閉，再指定匯入日期。'],
    notes: ['官方將 Read-Only 權限與下單、轉帳、提款權限分開。'],
  },
  {
    id: 'mexc', name: 'MEXC', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['抹茶'],
    source: 'https://mexcdevelop.github.io/apidocs/spot_v3_en/', credentialType: 'API Key + Secret', readPermission: '只允許 Spot Account Read／期貨讀取；關閉交易、轉帳與提款。',
    steps: ['登入 MEXC，前往 API 管理並建立 API Key。', '只選帳戶讀取或交易紀錄讀取權限，不開啟交易、轉帳、提款。', '選擇市場與日期區間；若超出單次查詢限制，需分段匯入。'],
    notes: ['現貨與合約使用不同 API 權限；可查期間也可能不同。'],
  },
  {
    id: 'pionex', name: 'Pionex', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['派網'],
    source: 'https://www.pionex.com/docs/api-docs/futures-api/general-info/authentication', credentialType: 'API Key + Secret', readPermission: '僅啟用 Enable reading；關閉 Enable trading 和 Enable transfer。',
    steps: ['登入 Pionex，前往 API Key 管理。', '建立 API Key，只啟用 Enable reading。', '確認 Enable trading 和 Enable transfer 都關閉，再選日期區間。'],
    notes: ['官方將 reading、trading、transfer 權限分開；此匯入只需要 reading。'],
  },
  {
    id: 'kucoin', name: 'KuCoin', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['庫幣', '库币'],
    source: 'https://www.kucoin.com/docs-new', credentialType: 'API Key + Secret + Passphrase', readPermission: '只使用 General／唯讀權限；不要開啟 Spot、Margin、Futures、Earn 或 Withdrawal 權限。',
    steps: ['登入 KuCoin，建立專用 API Key。', '只開啟 General／唯讀權限，設定 API Passphrase。', '確認所有下單、理財及提款權限都未啟用，再選擇日期區間。'],
    notes: ['KuCoin 將 General 定義為查詢帳戶、報表和訂單的唯讀權限。'],
  },
  {
    id: 'coinbase', name: 'Coinbase Advanced', category: '加密貨幣', market: 'crypto', region: 'crypto', keywords: ['Coinbase', 'Coinbase Advanced'],
    source: 'https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-overview', credentialType: 'API Key + Secret', readPermission: '只選 View；不可選 Trade、Transfer 或其他寫入權限。',
    steps: ['登入 Coinbase Developer Platform，建立 Advanced Trade API Key。', '權限只選 View，並確認沒有 Trade 或資金移轉權限。', '選擇日期區間及帳戶，查詢可用的成交紀錄。'],
    notes: ['不同地區、帳戶及產品可用的 API 和歷史紀錄範圍可能不同。'],
  },
  {
    id: 'btcc', name: 'BTCC', category: '加密貨幣', market: 'crypto', region: 'crypto',
    source: 'https://www.btcc.com/en-US/support-center/detail/24451281100697', credentialType: 'API Key + Secret', readPermission: '只選 Spot-Read／Futures-Read；不可選交易或提款權限。',
    steps: ['登入 BTCC，前往個人中心的 API Setting。', '建立專用 API Key，只允許 Spot-Read／Futures-Read。', '確認交易、取消委託、轉帳和提款功能未授權，再指定日期區間。'],
    notes: ['BTCC 衍生品歷史紀錄的 API 欄位和可讀範圍有限；匯入前需確認已平倉資料完整。'],
  },
  {
    id: 'tradovate', name: 'Tradovate', category: '期貨／差價合約', market: 'futures', region: 'us',
    source: 'https://api.tradovate.com/', credentialType: 'API Key + Secret', readPermission: '在 Application Settings → API Access 將 Orders、Account Information 等項目設為 Read only。',
    steps: ['登入 Tradovate，開啟 Application Settings → API Access。', '為專用 API Key 設定 Read only，至少允許查詢 Orders／成交資料。', '確認所有 Full Access 項目都未開啟，再選擇日期區間。'],
    notes: ['Tradovate 官方 API 權限可分 Read only 與 Full Access；匯入只需讀取成交清單。'],
  },
  {
    id: 'ibkr', name: 'Interactive Brokers (IBKR)', category: '證券', market: 'us-stocks', markets: ['us-stocks', 'hk-stocks', 'cn-stocks', 'futures'], region: 'us', keywords: ['盈透證券'], safetyMode: 'provider-read-only',
    source: 'https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service', credentialType: 'Flex Token + Query ID', readPermission: 'Flex Web Service 僅讀取你建立的報表；不使用下單、資金轉移 API。',
    steps: ['登入 IBKR Client Portal → Reporting → Flex Queries，建立含 Trades／Executions 的報表。', '啟用 Flex Web Service 並取得 Token 和 Query ID；這些憑證只允許取得報表。', '選擇日期區間後產生報表；IBKR 每次請求最長為 365 天。'],
    notes: ['IBKR Flex Web Service 需先在 Client Portal 建立報表及啟用服務；這是唯讀報表介面，不是下單 API。'],
  },
  {
    id: 'longbridge', name: '長橋證券 Longbridge', category: '證券', market: 'hk-stocks', markets: ['hk-stocks', 'us-stocks', 'cn-stocks'], region: 'hk', keywords: ['長橋', '长桥'], safetyMode: 'site-query-only',
    source: 'https://open.longbridge.com/docs/agent-auth', credentialType: '唯讀 OAuth', readPermission: '授權可選帳戶與交易等不同範圍；只授予匯入需要的查詢範圍。長橋提醒 Access Token 若外洩可能被用來交易，因此本站必須只呼叫固定歷史成交查詢，且絕不接受任意 API 網址。',
    steps: ['登入 Longbridge OpenAPI 開發者平台並完成 OAuth 授權。', '在授權畫面只選擇匯入所需的帳戶／成交查詢範圍，不要授予交易權限。', '回到本頁選擇市場和日期區間；官方歷史成交 API 最多每次回傳 1,000 筆。'],
    notes: ['長橋使用 OAuth，正式串接前需本站完成開發者應用註冊；官方文件提醒 Access Token 需妥善保管。歷史成交 API 不包含當日成交。'],
    availability: 'external-setup',
  },
  {
    id: 'saxo', name: 'Saxo', category: '證券', market: 'us-stocks', markets: ['us-stocks', 'hk-stocks', 'futures'], region: 'international',
    source: 'https://www.developer.saxo/openapi/referencedocs/hist/v1/transactions', credentialType: '唯讀 OAuth', readPermission: '只申請 Personal Read 權限；不可申請交易寫入、轉帳或提款權限。',
    steps: ['登入 Saxo Developer Portal，建立並設定 OpenAPI 應用。', '授權時只申請 Personal Read 權限。', '選擇要查詢的帳戶和日期區間，讀取歷史交易。'],
    notes: ['Saxo OpenAPI 應用需要註冊；不同帳戶地區和服務可能要求額外核准。'],
    availability: 'external-setup',
  },
  {
    id: 'tiger-brokers', name: '老虎證券 Tiger Brokers', category: '證券', market: 'us-stocks', markets: ['us-stocks', 'hk-stocks', 'cn-stocks', 'futures'], region: 'international', keywords: ['老虎證券', '老虎证券', 'Tiger Brokers'],
    source: 'https://docs-en.itigerup.com/docs/authentication', credentialType: '唯讀 OAuth', readPermission: 'OAuth 可分開授權帳戶查詢、交易查詢與交易操作；只授權前兩項，拒絕交易操作。',
    steps: ['登入 Tiger Developer Center，啟用 OpenAPI 並註冊個人開發者。', '使用 OAuth 授權應用，只選 Account Queries 和 Trade Queries；不要授權 Trade Operations。', '選擇要查詢的帳戶、市場及日期區間，再讀取歷史成交。'],
    notes: ['Tiger OpenAPI 也包含下單、修改及取消委託功能；本站串接必須只呼叫查詢端點，並要求使用者拒絕交易操作權限。正式連線仍需完成本站的開發者應用設定。'],
    availability: 'external-setup',
  },
  {
    id: 'futu', name: '富途證券 Futu', category: '證券', market: 'hk-stocks', markets: ['hk-stocks', 'us-stocks', 'cn-stocks'], region: 'hk', keywords: ['富途', '富途牛牛'], safetyMode: 'site-query-only',
    source: 'https://openapi.futunn.com/futu-api-doc/trade/overview.html', credentialType: '本機交易終端／OpenD', readPermission: 'OpenD 同時提供查詢和交易功能；只允許呼叫 history_deal_list_query，不呼叫 unlockTrade、placeOrder 或 modifyOrder。',
    steps: ['在你的電腦安裝並登入 Futu OpenD。', '透過本機 OpenD 的 history_deal_list_query 查詢歷史成交。', '此 API 需要本機連線服務；目前不能由雲端網站直接連到你的 OpenD。'],
    notes: ['Futu API 可查詢歷史成交，但依賴使用者本機 OpenD；要在網站匯入需另外安裝本機連接器。'],
    availability: 'local-only',
  },
  {
    id: 'moomoo', name: 'moomoo', category: '證券', market: 'us-stocks', markets: ['us-stocks', 'hk-stocks', 'cn-stocks'], region: 'international', keywords: ['Moomoo', 'moomoo證券'], safetyMode: 'site-query-only',
    source: 'https://openapi.moomoo.com/futu-api-doc/en/trade/get-history-order-fill-list.html', credentialType: '本機交易終端／OpenD', readPermission: 'OpenD 同時提供查詢和交易功能；只允許呼叫 history_deal_list_query，不呼叫 unlock_trade、place_order 或 modify_order。',
    steps: ['在你的電腦安裝並登入 moomoo OpenD。', '透過本機 OpenD 的 history_deal_list_query 查詢歷史成交。', '此 API 需要本機連線服務；目前不能由雲端網站直接連到你的 OpenD。'],
    notes: ['moomoo API 可查詢歷史成交，但依賴使用者本機 OpenD；要在網站匯入需另外安裝本機連接器。'],
    availability: 'local-only',
  },
  {
    id: 'ibkr-hk', name: '盈透證券（香港）IBKR Hong Kong', category: '證券', market: 'hk-stocks', markets: ['hk-stocks', 'us-stocks', 'cn-stocks', 'futures'], region: 'hk', keywords: ['盈透證券香港', '盈透證券(香港)', '盈透證券（香港）', 'Interactive Brokers Hong Kong', 'IBKR HK'], safetyMode: 'provider-read-only',
    source: 'https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service', credentialType: 'Flex Token + Query ID', readPermission: 'Flex Web Service 只讀取你建立的活動／成交報表；不使用下單、資金轉移 API。',
    steps: ['登入 IBKR Client Portal（香港帳戶）。', '前往 Reporting → Flex Queries，建立含 Trades／Executions 的報表。', '啟用 Flex Web Service 並取得 Token 和 Query ID；憑證只用來取得報表。', '選擇日期區間後產生報表；IBKR 每次請求最長為 365 天。'],
    notes: ['此表單項目專供香港地區 IBKR 使用；Flex Web Service 是唯讀報表介面，不是下單 API。'],
  },
  {
    id: 'sinopac-shioaji', name: '永豐金證券 Shioaji', category: '證券', market: 'tw-stocks', markets: ['tw-stocks', 'futures'], region: 'tw', keywords: ['永豐證券', '永豐金證券', 'SinoPac', 'Shioaji', '大戶投'], safetyMode: 'site-query-only',
    source: 'https://sinotrade.github.io/tutor/accounting/profit_loss/', credentialType: '本機交易終端／OpenD', readPermission: 'Shioaji 同一 API 也有下單、改單與取消功能。本站未啟用連線；規劃接頭只允許 list_profit_loss 與 list_profit_loss_detail 固定查詢，絕不呼叫交易方法。API Key／憑證本身仍須保護。',
    steps: ['向永豐開通 Shioaji API，並在自己的電腦安裝 Shioaji。', '使用官方已實現損益查詢，指定開始／結束日期；股票與期貨查詢資料欄位不同。', '匯入前核對成交配對、費用及證交稅；官方資料包含已實現損益明細。'],
    notes: ['官方 API 可查指定區間損益，期貨明細含交易稅及手續費；股票明細欄位則不同。本網站尚無本機 Shioaji 連接器，也不接受 API 金鑰。'],
    availability: 'local-only',
  },
  {
    id: 'qmt-cn', name: 'QMT／MiniQMT（中國券商）', category: '證券', market: 'cn-stocks', region: 'cn', keywords: ['迅投', '迅投QMT', 'MiniQMT', 'XtQuant', '國信QMT', '国信QMT', '中國股票 API', 'A股 API'], safetyMode: 'site-query-only',
    source: 'https://www.glsc.com.cn/qmt/doc/20191024.pdf', credentialType: '本機交易終端／OpenD', readPermission: 'QMT Python API 同時包含行情查詢與交易功能。本站未啟用連線；預定接頭只允許固定歷史成交查詢，不接受任意命令、不呼叫下單／撤單／銀證轉帳方法。QMT 終端若另有策略或手動操作仍不受本站控制。',
    steps: ['確認你的中國券商帳戶已開通 QMT／MiniQMT；不同券商提供的版本和權限不同。', '在你自己的電腦啟動券商 QMT 終端和官方 Python API。', '正式串接後，本站只會以固定查詢功能讀取歷史成交；目前尚未提供本機連接器。'],
    notes: ['此項目代表部分中國券商提供的 QMT／MiniQMT 本機介面，並非所有券商都支援。官方 QMT 文件亦包含模型交易能力；本網站目前沒有 API 連線或下單功能。'],
    availability: 'local-only',
  },
  {
    id: 'alpaca', name: 'Alpaca', category: '證券', market: 'us-stocks', markets: ['us-stocks', 'crypto'], region: 'us', keywords: ['Alpaca Markets', 'Alpaca Trading'], safetyMode: 'site-query-only',
    source: 'https://docs.alpaca.markets/us/docs/account-activities', credentialType: 'API Key + Secret', readPermission: 'Account Activities 提供成交活動查詢，但 Alpaca 同一交易 API 也提供下單端點。本站未啟用連線；規劃接頭只准許 GET 活動查詢，絕不轉送使用者指定網址或寫入請求。API Key 仍要妥善保管。',
    steps: ['在 Alpaca 建立帳戶並前往 API Keys。', '建立專用憑證；若你的帳戶可選擇權限，僅開啟讀取，並停用交易／資金權限。', '正式串接後選擇日期區間，讀取 FILL 成交活動；分批成交需配對成完整交易。'],
    notes: ['官方 Account Activities API 可查成交及其他帳戶活動；目前本站尚未申請應用程式或啟用 API 連線。'],
  },
];

const normalize = (value: string) => value.toLocaleLowerCase().replace(/[\s\-_.／/（）()]+/g, '');

export function searchApiImportGuides(query: string, region: BrokerRegion | 'all' = 'all'): ApiImportGuide[] {
  const q = normalize(query);
  return apiImportGuides.filter(guide => (region === 'all' || guide.region === region) && (!q || [guide.name, guide.id, guide.category, ...(guide.keywords ?? [])].some(value => normalize(value).includes(q) || q.includes(normalize(value)))));
}

export function exactApiImportGuide(query: string): ApiImportGuide | undefined {
  const q = normalize(query);
  return q ? apiImportGuides.find(guide => [guide.name, guide.id, ...(guide.keywords ?? [])].some(value => normalize(value) === q)) : undefined;
}
