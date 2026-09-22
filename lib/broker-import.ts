import { marketCurrencies,newTrade,type Trade } from './trades';

export type BrokerGuide={id:string;name:string;category:'加密貨幣'|'期貨／差價合約'|'證券';market:Trade['market'];source:string;steps:string[];notes?:string[]};

export const brokerGuides:BrokerGuide[]=[
 {id:'bingx',name:'BingX',category:'加密貨幣',market:'crypto',source:'https://bingx.com/zh-tc/support/articles/18543372084633-%E5%A6%82%E4%BD%95%E5%9C%A8BingX%E7%94%B3%E5%A0%B1%E7%A8%85%E5%8B%99%EF%BC%9F/',steps:['使用網頁版登入 BingX。','進入資產或訂單紀錄，開啟資金流水／歷史訂單匯出。','選擇交易類型與日期範圍，產生並下載 CSV。','回到本頁選擇檔案，上傳後逐筆核對。']},
 {id:'binance',name:'Binance',category:'加密貨幣',market:'crypto',source:'https://www.binance.com/en-NZ/support/faq/detail/e4ff64f2533f4d23a0b3f8f17f510eab',steps:['網頁版登入 Binance，前往訂單。','現貨：選擇現貨訂單 → 交易歷史 → 匯出交易歷史。期貨：選擇 USDⓈ-M 或 COIN-M 期貨訂單 → 訂單歷史 → 匯出。','選擇日期範圍，按 Generate／產生後下載 CSV。','Binance 報表時間通常採 UTC；上傳後請核對轉換後的台北時間。'],notes:['若逐筆成交檔沒有完整開倉與平倉資料，請改匯出包含已實現盈虧的交易／倉位紀錄。']},
 {id:'bitget',name:'Bitget',category:'加密貨幣',market:'crypto',source:'https://www.bitget.com/support/articles/12560603824169',steps:['使用網頁版登入 Bitget。','前往帳戶資料匯出頁，或 Orders／訂單頁。','選擇交易或訂單歷史、帳戶、日期範圍與 CSV／Excel 格式。','按 Generate，完成後下載並回到本頁上傳。'],notes:['Bitget 每次可申請的期間與下載有效期以官方頁面顯示為準。']},
 {id:'okx',name:'OKX',category:'加密貨幣',market:'crypto',source:'https://www.okx.com/en-us/help/how-to-download-my-account-statements',steps:['登入 OKX 網頁版。','前往 Assets／資產 → Order center／訂單中心 → Order history／訂單歷史。','點 Download／下載，選日期範圍後按 Export／匯出。','下載 CSV 或 Excel，再回到本頁上傳。']},
 {id:'bybit',name:'Bybit',category:'加密貨幣',market:'crypto',source:'https://www.bybit.com/en/help-center/article/How-to-Self-Export-Account-Data',steps:['使用網頁版登入 Bybit。','前往 Orders → Unified Trading Order，打開對應的歷史頁籤。','按 Export，選日期與合約，再按 Export Now。','下載 Transaction Log 或 Order History CSV，回到本頁上傳。']},
 {id:'mexc',name:'MEXC',category:'加密貨幣',market:'crypto',source:'https://www.mexc.com/support/article/how-to-use-mexc-s-account-data-export-function-410103096834075648',steps:['登入 MEXC 網頁版，開啟 Help Center／幫助中心。','選 Self-Services → Account Data Export。','選 Futures 或 Spot，再選 Position／Order／Trade History 與日期。','格式選 Excel，按 Export，下載後回到本頁上傳。']},
 {id:'pionex',name:'Pionex',category:'加密貨幣',market:'crypto',source:'https://www.pionex.com/blog/how-to-export-pionex-transaction-history-statement/',steps:['登入 Pionex 網頁版，點右上角頭像 → Dashboard。','進入 Transaction History，選日期後 Submit。','收到完成通知後下載 Excel。','回到本頁上傳並核對交易。']},
 {id:'ibkr',name:'IBKR',category:'證券',market:'futures',source:'https://www.ibkrguides.com/clientportal/performanceandstatements/runstatement.htm',steps:['登入 Client Portal。','前往 Performance & Reports → Statements。','執行報表，選期間並把格式設為 CSV。','下載後回到本頁上傳。'],notes:['若要自訂欄位，可在 Performance & Reports → Flex Queries 建立 Trade Confirmation Flex Query 並選 CSV。']},
 {id:'ninjatrader',name:'NinjaTrader',category:'期貨／差價合約',market:'futures',source:'https://ninjatrader.com/support/helpGuides/nt8/executions_tab.htm',steps:['開啟 NinjaTrader Desktop 的 Control Center。','進入 Executions 頁籤，設定需要的日期範圍。','在表格按右鍵，選 Export。','格式選 CSV 或 Excel，儲存後回到本頁上傳。'],notes:['Executions 是逐筆成交資料；若無法配對完整進出場，請改匯出 Trades／Performance 報表。']},
 {id:'etoro',name:'eToro',category:'證券',market:'futures',source:'https://help.etoro.com/articles/cs/Knowledge/how-can-i-see-my-investment-history-on-the-web-version-of-etoro',steps:['登入 eToro 網頁版並開啟 Investment History／投資歷史。','點選更多選單，開啟 Account Statement／帳戶報表。','選擇日期範圍並匯出 Excel。','回到本頁上傳並核對市場、幣別與費用。']},
 {id:'topstepx',name:'TopstepX',category:'期貨／差價合約',market:'futures',source:'https://help.topstep.com/en/articles/14434175-topstepx',steps:['登入 TopstepX。','在畫面底部開啟 Orders 或 Trades 頁籤。','點 Export，設定日期範圍後再次按 Export。','下載檔可用 Excel／Google Sheets 開啟；回到本頁上傳。']},
 {id:'ftmo',name:'FTMO',category:'期貨／差價合約',market:'futures',source:'https://ftmo.com/en/trading-platforms/',steps:['先確認 FTMO 使用的平台：MT4、MT5 或 cTrader。','在平台開啟 Account History／History／交易歷史，設定完整日期範圍。','匯出報表；若只提供 HTML，請用 Excel 開啟後另存成 CSV。','回到本頁上傳並核對。'],notes:['FTMO 的匯出入口取決於你使用的交易平台，並非單一 FTMO 選單。']},
 {id:'projectx',name:'ProjectX',category:'期貨／差價合約',market:'futures',source:'https://help.topstep.com/en/articles/14434175-topstepx',steps:['登入採用 ProjectX 的交易平台。','開啟 Orders 或 Trades／交易頁。','點 Export，選日期範圍後下載。','回到本頁上傳。'],notes:['ProjectX 由多個品牌採用，選單名稱可能不同；若找不到，請在該品牌說明中心搜尋 Export trades。']},
 {id:'tradovate',name:'Tradovate',category:'期貨／差價合約',market:'futures',source:'https://partner.tradovate.com/resources/admin-dashboards/reports',steps:['登入 Tradovate，開啟 Account Reports／帳戶報表。','選 Performance 或 Orders 報表。','設定帳戶與日期範圍，下載 CSV。','回到本頁上傳並核對。']},
 {id:'yuanta',name:'元大證券',category:'證券',market:'tw-stocks',source:'https://www.yuanta.com.tw/eYuanta/securities/aporder/Instructions/836878aa-5e5f-4dc8-9d18-984e9bf5c1cd?TargetId=07810b35-add8-4871-b94b-88539a43f88f&TargetMode=2',steps:['登入元大投資先生／行動精靈或網頁下單系統。','前往帳務查詢 → 股票帳務 → 股票對帳單。','選擇日期範圍並查詢。','使用 Excel 匯出，再回到本頁上傳。'],notes:['不同元大介面名稱可能略有差異；也可在成交明細表格按右鍵匯出 Excel。']},
 {id:'saxo',name:'Saxo',category:'證券',market:'hk-stocks',source:'https://www.help.saxo/hc/en-us/articles/360039762472-Monitoring-your-Portfolio',steps:['登入 SaxoInvestor 或 SaxoTrader。','前往 Portfolio／投資組合 → Transactions／交易。','篩選交易與日期範圍。','選 Export → Excel，下載後回到本頁上傳。']},
];

type Cell=string|number|boolean|Date|null|undefined;
export type ParsedBrokerTrade={trade:Trade;warnings:string[];selected:boolean;confirmed:boolean;sourceRow:number};
const norm=(v:Cell)=>String(v??'').trim().toLowerCase().replace(/[\s_\-()（）/]+/g,'');
const aliases={
 symbol:['symbol','instrument','contract','product','market','pair','tradingpair','security','商品','商品代號','股票代號','合約'],
 side:['side','direction','positionside','action','buysell','買賣','方向'],entryTime:['entrytime','opentime','openingtime','starttime','opendate','開倉時間','進場時間'],
 exitTime:['exittime','closetime','closingtime','endtime','closedate','平倉時間','出場時間'],entry:['entryprice','openprice','avgentryprice','averageentryprice','openingprice','開倉均價','進場價','買均價'],
 exit:['exitprice','closeprice','avgexitprice','averageexitprice','closingprice','平倉均價','出場價','賣均價'],quantity:['quantity','qty','size','amount','volume','executedqty','closedsize','contracts','units','股數','口數','數量'],
 pnl:['pnl','pl','profit','profitloss','realizedpnl','closedpnl','realizedpl','netprofit','淨損益','已實現盈虧','平倉損益','損益'],commission:['commission','brokerage','brokeragefee','佣金','手續費','手续费'],transactionTax:['transactiontax','securitiestransactiontax','證券交易稅','证券交易税','證交稅','证交税','交易稅','交易税'],fees:['fee','fees','tradingfee','otherfees','其他費用','其他费用','交易費','交易费'],
 currency:['currency','settlementcurrency','basecurrency','幣別','結算幣別'],account:['account','accountid','accountname','帳戶','帳戶名稱'],leverage:['leverage','槓桿'],marginMode:['marginmode','保證金模式']
} as const;
function find(headers:string[],keys:readonly string[]){const wanted=new Set(keys.map(norm));return headers.findIndex(h=>wanted.has(norm(h)));}
function number(v:Cell){if(typeof v==='number')return Number.isFinite(v)?v:null;const text=String(v??'').replace(/[^0-9+\-.]/g,'');const n=Number(text);return text&&Number.isFinite(n)?n:null;}
function taipeiTime(v:Cell,offset:number){if(v instanceof Date&&!Number.isNaN(v.getTime()))return new Date(v.getTime()+8*3600000).toISOString().slice(0,16);const s=String(v??'').trim();if(!s)return '';
 const match=s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::\d{2})?/);if(!match)return '';
 const [,y,mo,d,h,mi]=match,utc=Date.UTC(+y,+mo-1,+d,+h-offset,+mi);return new Date(utc+8*3600000).toISOString().slice(0,16);
}
function side(v:Cell,entry:number,exit:number):Trade['side']{const s=norm(v);if(['sell','short','賣','空','賣出'].some(x=>s.includes(norm(x))))return 'short';if(['buy','long','買','多','買入'].some(x=>s.includes(norm(x))))return 'long';return exit>=entry?'long':'short';}
export function parseBrokerRows(rows:Cell[][],guide:BrokerGuide,sourceOffset=0):ParsedBrokerTrade[]{
 const headerIndex=rows.findIndex(row=>row.filter(v=>String(v??'').trim()).length>=3);if(headerIndex<0)return [];
 const headers=rows[headerIndex].map(v=>String(v??''));const at=Object.fromEntries(Object.entries(aliases).map(([key,value])=>[key,find(headers,value)])) as Record<keyof typeof aliases,number>;
 if(at.symbol<0||at.entry<0||at.exit<0||at.quantity<0)return [];
 const value=(row:Cell[],key:keyof typeof aliases)=>at[key]>=0?row[at[key]]:null,result:ParsedBrokerTrade[]=[];
 for(let i=headerIndex+1;i<rows.length&&result.length<50;i++){const row=rows[i],symbol=String(value(row,'symbol')??'').trim().toUpperCase();if(!symbol)continue;
  const entry=number(value(row,'entry')),exit=number(value(row,'exit')),qty=number(value(row,'quantity'));if(entry==null||exit==null||qty==null)continue;
  const warnings:string[]=[],entryTime=taipeiTime(value(row,'entryTime'),sourceOffset),exitTime=taipeiTime(value(row,'exitTime'),sourceOffset);if(!entryTime)warnings.push('找不到完整進場時間');if(!exitTime)warnings.push('找不到完整出場時間');
  const currencyText=String(value(row,'currency')??'').toUpperCase(),allowed=['USD','USDT','TWD','CNY','HKD'] as const,currency=allowed.find(c=>currencyText.includes(c))??marketCurrencies[guide.market];
  const trade={...newTrade(),id:crypto.randomUUID(),market:guide.market,currency,symbol,side:side(value(row,'side'),entry,exit),account:String(value(row,'account')??guide.name).trim()||guide.name,entryTime,exitTime,entry,exit,quantity:Math.abs(qty),multiplier:1,commission:number(value(row,'commission')),transactionTax:number(value(row,'transactionTax')),fees:number(value(row,'fees')),funding:null,netOverride:number(value(row,'pnl')),profitBasis:'net' as const,strategy:'',notes:`${guide.name} 檔案匯入`,positionValue:guide.market==='crypto'?Math.abs(qty)*entry:null,leverage:number(value(row,'leverage')),marginMode:norm(value(row,'marginMode')).includes('isolated')?'isolated' as const:norm(value(row,'marginMode')).includes('cross')?'cross' as const:null};
  if(at.pnl<0)warnings.push('檔案未找到盈虧欄，將依價格與數量估算');if(at.commission<0)trade.commission=null;if(at.transactionTax<0)trade.transactionTax=null;if(at.fees<0)trade.fees=null;
  result.push({trade,warnings,selected:true,confirmed:false,sourceRow:i+1});
 }
 return result;
}

export function parseCsv(text:string):Cell[][]{const rows:Cell[][]=[],first=(text.replace(/^\uFEFF/,'').split(/\r?\n/)[0]??''),delimiter=['\t',';',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];let row:Cell[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(v=>String(v).trim()))rows.push(row);return rows;
}
