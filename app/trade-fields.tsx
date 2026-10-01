'use client';
import { editExcursions } from '@/lib/trade-excursions';
import { useI18n } from './language-provider';
import { useId, useState } from 'react';
import DateTime24 from './date-time24';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cryptoExcursionPosition, feeCost, grossPnl, initialMargin, isFuturesMarket, marketCurrencies, multiplierForSymbol, parseSignedAmount, pnl, positionValue, type Trade } from '@/lib/trades';
import { timezoneName, utcOffsetLabel } from '@/lib/preferences';

export function Choice({label,value,options,onChange}:{label:string;value:string;options:[string,string][];onChange:(s:string)=>void}) {
 return <div className="form-field"><label>{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>;
}
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
type CostField='fees'|'commission'|'transactionTax'|'exchangeFee'|'clearingFee'|'settlementFee'|'regulatoryFee'|'secFee'|'finraFee'|'futuresTax';
type NumberField='entry'|'exit'|'quantity'|'multiplier'|CostField;
const stockMarkets=['us-stocks','tw-stocks','cn-stocks','hk-stocks'];

export function CalculationSummary({trade:t}:{trade:Trade}) {
 const {t:tx}=useI18n();
 const margin=initialMargin(t),profit=pnl(t),returnRate=margin&&margin>0?profit/margin*100:null;
 const taxLabel=t.market==='cn-stocks'?tx('印花稅'):t.market==='hk-stocks'?tx('股票印花稅'):tx('證券交易稅');
 const itemized:[CostField,string][]=[['exchangeFee','交易所手續費'],['clearingFee','結算手續費'],['settlementFee','交割手續費'],['regulatoryFee','監管費／徵費'],['secFee','SEC 交易費'],['finraFee','FINRA 活動費'],['futuresTax','期貨交易稅']];
 return <div className="calculation-summary" aria-live="polite">
  {t.market==='crypto'&&<><div><span>{tx('進場倉位金額')}</span><strong>{positionValue(t)>0?`${fmt(positionValue(t))} ${t.currency}`:tx('未知')}</strong></div><div><span>{tx(t.marginAmount!=null?'該筆進場保證金':'估算初始保證金')}</span><strong>{margin===null?tx('填寫槓桿後計算'):`${fmt(margin)} ${t.currency}`}</strong></div></>}
  {!(t.netOverride!==null&&t.profitBasis!=='gross')&&<>
   <div><span>{tx('交易盈虧（未扣費）')}</span><strong className={(t.netOverride??grossPnl(t))>=0?'positive':'negative'}>{(t.netOverride??grossPnl(t))>0?'+':''}{fmt(t.netOverride??grossPnl(t))} {t.currency}</strong></div>
   <div><span>{tx(stockMarkets.includes(t.market)?'券商手續費':'佣金 Commission')}</span><strong>{t.commission==null?tx('未知／未計入'):`−${fmt(Math.abs(t.commission))}`}</strong></div>
   {t.transactionTax!=null&&<div><span>{taxLabel}</span><strong>−{fmt(Math.abs(t.transactionTax))}</strong></div>}
   {itemized.map(([key,label])=>t[key]!=null&&<div key={key}><span>{tx(label)}</span><strong>−{fmt(Math.abs(t[key]??0))}</strong></div>)}
   <div><span>{tx(feeCost(t)<0?'加回返佣':t.market==='crypto'?'交易所成交手續費':'其他交易費')}</span><strong>{t.fees==null?tx('未知／未計入'):`${feeCost(t)<0?'+':'−'}${fmt(Math.abs(feeCost(t)))}`}</strong></div>
   {t.funding!=null&&t.funding!==0&&<div><span>{tx('資金費（支付扣除／收到加回）')}</span><strong>{(t.funding??0)<0?'+':'−'}{fmt(Math.abs(t.funding??0))}</strong></div>}
  </>}
  <div><span>{tx(t.netOverride!==null?'依填寫盈虧計算':'自動計算淨盈虧')}</span><strong className={profit>=0?'positive':'negative'}>{profit>0?'+':''}{fmt(profit)} {t.currency}</strong></div>
  {returnRate!==null&&<div><span>{tx('估算保證金報酬率')}</span><strong className={profit>=0?'positive':'negative'}>{returnRate>0?'+':''}{fmt(returnRate)}%</strong></div>}
  {t.market==='crypto'&&<p>{tx(t.marginAmount!=null?'以填寫的該筆進場保證金計算報酬率；不含交易所額外費用或追加保證金。':'以進場倉位金額 ÷ 槓桿估算，不含交易所額外費用或追加保證金。')}{t.marginMode==='cross'?tx('全倉共用帳戶資金，此數值不代表最大損失或實際占用資金。'):''}</p>}
 </div>;
}

export default function TradeFields({trade:t,onChange:commit,notes=true}:{trade:Trade;onChange:(t:Trade)=>void;notes?:boolean}) {
 const {t:tx}=useI18n();
 const uid=useId(),[profitText,setProfitText]=useState(t.netOverride===null?'':String(t.netOverride)),[fundingDirection,setFundingDirection]=useState((t.funding??0)<0?'received':'paid');
 const onChange=(next:Trade)=>{const size=cryptoExcursionPosition(next);commit(editExcursions(t,size&&next.positionSizing?{...next,quantity:size.quantity,positionValue:size.notional}:next.positionSizing==='closing-notional'?{...next,quantity:0,positionValue:null}:next));};
 const set=<K extends keyof Trade>(key:K,value:Trade[K])=>onChange({...t,[key]:value});
 const tradeTimezone=t.timezone??'Asia/Taipei',timezoneLabel=`${tx(timezoneName(tradeTimezone))} · ${utcOffsetLabel(tradeTimezone,new Date(`${t.entryTime.slice(0,10)}T12:00:00Z`))}`;
 function numeric(key:NumberField,value:number|null) {
  const isCost=!['entry','exit','quantity','multiplier'].includes(key);
  const next={...t,[key]:isCost?(value===null?null:Math.abs(value)):value??0};
  if(t.market==='crypto'&&t.positionSizing!=='base-quantity'&&t.positionSizing!=='margin'&&t.positionSizing!=='closing-notional'){const known=positionValue(t);next.positionValue=known>0?known:null;next.quantity=known>0&&next.entry>0?known/next.entry:0;}
  onChange(next);
 }
 const numberField=(key:NumberField,label:string)=>{
  const isCost=!['entry','exit','quantity','multiplier'].includes(key);
  return <div className="form-field" key={key}><label htmlFor={`${uid}-${key}`}>{label}</label><Input id={`${uid}-${key}`} type="number" required={!isCost} step={key==='quantity'&&isFuturesMarket(t.market)?'1':'any'} min="0" value={isCost?(t[key]==null?'':Math.abs(t[key] as number)):t[key]||''} placeholder={isCost?tx('未知／不填'):tx('未知可留白')} onChange={e=>numeric(key,e.target.value===''?null:Number(e.target.value))}/></div>;
 };
 const feeFields:{key:CostField;label:string}[]=[
  {key:'commission',label:tx(stockMarkets.includes(t.market)?'券商佣金（{0}）':'佣金／期貨商佣金（{0}）',[t.currency])},
  ...(t.market==='futures'?[{key:'exchangeFee' as const,label:tx('交易所手續費（{0}）',[t.currency])},{key:'clearingFee' as const,label:tx('結算手續費（{0}）',[t.currency])},{key:'regulatoryFee' as const,label:tx('監管費／NFA 費（{0}）',[t.currency])}]:[]),
  ...(t.market==='tw-index-futures'?[{key:'exchangeFee' as const,label:tx('期交所經手費（{0}）',[t.currency])},{key:'clearingFee' as const,label:tx('結算手續費（{0}）',[t.currency])},{key:'settlementFee' as const,label:tx('交割手續費（{0}）',[t.currency])},{key:'futuresTax' as const,label:tx('期貨交易稅（{0}）',[t.currency])}]:[]),
  ...(t.market==='us-stocks'?[{key:'secFee' as const,label:tx('SEC 交易費（{0}）',[t.currency])},{key:'finraFee' as const,label:tx('FINRA 活動費（{0}）',[t.currency])},{key:'regulatoryFee' as const,label:tx('其他監管費（{0}）',[t.currency])}]:[]),
  ...(t.market==='tw-stocks'?[{key:'transactionTax' as const,label:tx('證券交易稅（{0}）',[t.currency])}]:[]),
  ...(t.market==='cn-stocks'?[{key:'transactionTax' as const,label:tx('印花稅（{0}）',[t.currency])},{key:'exchangeFee' as const,label:tx('交易經手費（{0}）',[t.currency])},{key:'regulatoryFee' as const,label:tx('證管費（{0}）',[t.currency])},{key:'clearingFee' as const,label:tx('過戶／結算費（{0}）',[t.currency])}]:[]),
  ...(t.market==='hk-stocks'?[{key:'transactionTax' as const,label:tx('股票印花稅（{0}）',[t.currency])},{key:'exchangeFee' as const,label:tx('港交所交易費（{0}）',[t.currency])},{key:'regulatoryFee' as const,label:tx('SFC／AFRC 交易徵費（{0}）',[t.currency])},{key:'clearingFee' as const,label:tx('結算／CCASS 費（{0}）',[t.currency])}]:[]),
  ...(t.market==='crypto'?[{key:'exchangeFee' as const,label:tx('交易所成交費（{0}）',[t.currency])}]:[]),
  {key:'fees',label:tx('其他交易費 Fee（{0}）',[t.currency])},
 ];
 const guidance=t.market==='tw-index-futures'?'台指期依契約可能有經手費、結算費、交割費與期貨交易稅；期貨商佣金依券商約定。請依成交明細填入實際金額。':t.market==='futures'?'美股期貨費用包含期貨商佣金、交易所費、清算費及可能的監管費；依商品、清算商和券商帳單填入。':t.market==='us-stocks'?'美股現貨可能包含券商佣金、SEC 交易費、FINRA 活動費及其他監管費；部分費用依賣出金額與生效日期改變。':t.market==='tw-stocks'?'台股券商佣金由券商訂定，證券交易稅依商品及買賣方向不同；請按對帳單分開填入。':t.market==='cn-stocks'?'A 股費用可能包含券商佣金、賣方印花稅、交易經手費、證管費及過戶費；請依股票／ETF 類型及交割單填入。':t.market==='hk-stocks'?'港股費用可能包含雙邊股票印花稅、港交所交易費、SFC／AFRC 徵費、結算費及券商佣金；CCASS 費用是否轉嫁依券商而異。':t.market==='crypto'?'加密貨幣交易費依平台、商品與 maker／taker 等級不同；永續合約資金費另行填寫，未知項目留白。':'Commission 與 Fee 分開填；若帳單只有合計，填入其他交易費。';

 return <><div className="form-grid">
  <Choice label={tx('市場')} value={t.market} options={[["futures",tx('美股期貨')],["tw-index-futures",tx('台指期')],["crypto",tx('加密貨幣')],["us-stocks",tx('美股現貨')],["tw-stocks",tx('台股')],["cn-stocks",tx('A股')],["hk-stocks",tx('港股')]]} onChange={v=>{const next=v as Trade['market'],symbol=next==='tw-index-futures'?'TXF':next==='futures'?'MNQ':next==='crypto'?'BTCUSDT':t.symbol;onChange({...t,market:next,symbol,multiplier:isFuturesMarket(next)?multiplierForSymbol(symbol,next==='tw-index-futures'?200:2):1,currency:marketCurrencies[next],quantity:next==='crypto'?0:1,positionValue:null,closingPositionValue:null,leverage:null,marginMode:null,marginAmount:null,positionSizing:null,funding:null,fees:null,commission:null,transactionTax:null,exchangeFee:null,clearingFee:null,settlementFee:null,regulatoryFee:null,secFee:null,finraFee:null,futuresTax:null,mae:null,mfe:null,exchangeSource:null,cryptoProductType:null,priceSymbol:null});}}/>
  <div className="form-field"><label htmlFor={`${uid}-symbol`}>{tx('商品代號')}</label><Input id={`${uid}-symbol`} required maxLength={30} value={t.symbol} placeholder={t.market==='tw-index-futures'?'TXF / MXF / TMF':'MNQ / BTCUSDT'} onChange={e=>{const symbol=e.target.value.toUpperCase();onChange({...t,symbol,multiplier:isFuturesMarket(t.market)?multiplierForSymbol(symbol,t.multiplier):1});}}/></div>
  <Choice label={tx('交易方向')} value={t.side} options={[["long",tx('做多 Long')],["short",tx('做空 Short')]]} onChange={v=>set('side',v as Trade['side'])}/>
  <Choice label={tx('計價幣別')} value={t.currency} options={[["USD",tx('USD 美元')],["USDT","USDT"],["TWD",tx('TWD 新台幣')],["CNY",tx('CNY 人民幣')],["HKD",tx('HKD 港幣')]]} onChange={v=>onChange({...t,currency:v as Trade['currency'],...(t.positionSizing==='closing-notional'&&v!=='USDT'?{positionSizing:null,closingPositionValue:null,positionValue:null,quantity:0}:{}),riskAmount:null,mae:null,mfe:null})}/>
  <div className="form-field wide"><label htmlFor={`${uid}-account`}>{tx('帳戶名稱')}</label><Input id={`${uid}-account`} required maxLength={80} value={t.account} onChange={e=>set('account',e.target.value)} placeholder={tx('例如：Binance 主帳戶')}/></div>
  {(['entryTime','exitTime'] as const).map((key,i)=><div className="form-field" key={key}><label htmlFor={`${uid}-${key}`}>{tx(i?'出場時間（{0}）':'進場時間（{0}）',[timezoneLabel])}</label><DateTime24 id={`${uid}-${key}`} label={i?tx('出場'):tx('進場')} value={t[key]} onChange={value=>set(key,value)}/></div>)}
  {numberField('entry',tx('平均進場價'))}{numberField('exit',tx('平均出場價'))}
  {isFuturesMarket(t.market)?<>{numberField('quantity',tx('口數'))}{numberField('multiplier',tx('每點乘數'))}</>:t.market==='crypto'?<>
   <Choice label={tx('部位計算依據')} value={t.positionSizing??'unknown'} options={[["unknown",tx('請確認數量單位')],["notional",tx('進場倉位金額')],...(t.currency==='USDT'?[["closing-notional",tx('平倉倉位金額')] as [string,string]]:[]),["base-quantity",tx('實際幣數')],["margin",tx('該筆保證金 × 槓桿')]]} onChange={v=>onChange({...t,positionSizing:v==='unknown'?null:v as Trade['positionSizing'],positionValue:v==='notional'?t.positionValue:null})}/>
   {t.positionSizing==='base-quantity'?numberField('quantity',tx('實際幣數')):t.positionSizing==='closing-notional'?<div className="form-field"><label htmlFor={`${uid}-closing-value`}>{tx('平倉數量／倉位金額（USDT）')}</label><Input id={`${uid}-closing-value`} type="number" min="0" step="any" value={t.closingPositionValue??''} placeholder={tx('未知／不填')} onChange={e=>set('closingPositionValue',e.target.value===''?null:Number(e.target.value))}/></div>:t.positionSizing==='margin'?<div className="form-field"><label htmlFor={`${uid}-margin`}>{tx('該筆進場保證金（{0}）',[t.currency])}</label><Input id={`${uid}-margin`} type="number" min="0" step="any" value={t.marginAmount??''} placeholder={tx('未知／不填')} onChange={e=>set('marginAmount',e.target.value===''?null:Number(e.target.value))}/></div>:<div className="form-field"><label htmlFor={`${uid}-value`}>{tx('進場倉位金額（')}{t.currency}）</label><Input id={`${uid}-value`} type="number" min="0" step="any" value={t.positionValue??''} placeholder={tx('例如：1,000')} onChange={e=>{const value=e.target.value===''?null:Number(e.target.value);onChange({...t,positionSizing:'notional',positionValue:value,quantity:value!=null&&t.entry>0?value/t.entry:0,multiplier:1});}}/></div>}
   {t.positionSizing==='closing-notional'&&<p className="field-hint wide">{tx('平倉金額除以平均出場價換成幣數，再依持倉價格變化計算 MAE／MFE；不需初始保證金或槓桿。只適用明確 USDT 金額、完整平倉且部位不變的線性交易，合約張數不能直接填在此欄。')}</p>}
   <Choice label={tx('保證金模式')} value={t.marginMode??'unknown'} options={[["unknown",tx('尚未填寫')],["cross",tx('全倉')],["isolated",tx('逐倉')]]} onChange={v=>set('marginMode',v==='unknown'?null:v as Trade['marginMode'])}/>
   <Choice label={tx('加密商品類型')} value={t.cryptoProductType??'unknown'} options={[["unknown",tx('尚未確認')],["spot",tx('現貨')],["perpetual",tx('永續合約')]]} onChange={v=>onChange({...t,cryptoProductType:v==='unknown'?null:v as Trade['cryptoProductType']})}/>
   <Choice label={tx('原始交易所（選填）')} value={t.exchangeSource??'none'} options={[["none",tx('未設定')],["bybit","Bybit"],["bitget","Bitget"],["okx","OKX"],["kucoin","KuCoin"],["bingx","BingX"],["mexc","MEXC"],["binance",'Binance '+tx('USDT 永續合約')]]} onChange={v=>set('exchangeSource',v==='none'?null:v as NonNullable<Trade['exchangeSource']>)}/>
   <p className="market-metrics-note">{tx('行情分析自動依序查 OKX、Bybit、BingX；請確認現貨或永續類型，不需加密行情金鑰。')}</p>
   <div className="form-field"><label htmlFor={`${uid}-leverage`}>{tx('槓桿倍數')}</label><Input id={`${uid}-leverage`} type="number" min="1" max="1000" step="any" value={t.leverage??''} placeholder={tx('例如：10')} onChange={e=>set('leverage',e.target.value===''?null:Number(e.target.value))}/></div>
   {t.positionSizing!=='margin'&&<div className="form-field"><label htmlFor={`${uid}-margin`}>{tx('該筆進場保證金（{0}）',[t.currency])}</label><Input id={`${uid}-margin`} type="number" min="0" step="any" value={t.marginAmount??''} placeholder={tx('未知／不填')} onChange={e=>set('marginAmount',e.target.value===''?null:Number(e.target.value))}/></div>}
   <p className="field-hint wide">{tx('只填此筆交易進場時的保證金，不填帳戶總資金。全倉共用資金不能代表此筆可承受的最大虧損。以保證金估算時需永續合約、全倉／逐倉與槓桿；已有實際幣數或倉位金額時，不會再乘一次槓桿。')}</p>
  </>:numberField('quantity',tx('股數'))}
  <div className="form-field wide"><label htmlFor={`${uid}-price-symbol`}>{tx('行情商品代號（選填）')}</label><Input id={`${uid}-price-symbol`} maxLength={30} value={t.priceSymbol??''} placeholder={tx('與交易商品相同可留白；期貨請填確切月份')} onChange={e=>set('priceSymbol',e.target.value||null)}/></div>
  <div className="form-field wide cost-section-heading"><h4>{tx('最大浮盈／最大浮虧（選填）')}</h4></div>
  <div className="form-field"><label htmlFor={`${uid}-mae`}>{tx('最大浮虧 MAE 金額（{0}）',[t.currency])}</label><Input id={`${uid}-mae`} type="number" min="0" step="any" value={t.mae==null?'':Math.abs(t.mae)} placeholder={tx('未知／不填')} onChange={e=>set('mae',e.target.value===''?null:-Math.abs(Number(e.target.value)))}/></div>
  <div className="form-field"><label htmlFor={`${uid}-mfe`}>{tx('最大浮盈 MFE 金額（{0}）',[t.currency])}</label><Input id={`${uid}-mfe`} type="number" min="0" step="any" value={t.mfe==null?'':Math.abs(t.mfe)} placeholder={tx('未知／不填')} onChange={e=>set('mfe',e.target.value===''?null:Math.abs(Number(e.target.value)))}/></div>
  <p className="field-hint" style={{gridColumn:'1 / -1',margin:0}}>{tx('輸入金額大小即可；最大浮虧會以負值記錄。留白可照常儲存，系統不會把空白當成零。')}</p>
  <div className="form-field wide cost-section-heading"><h4>{tx('交易規費明細')}</h4></div>
  {feeFields.map(({key,label})=>numberField(key,label))}
  <Choice label={tx('其他交易費方向')} value={t.feeMode??'paid'} options={[["paid",tx('支付其他費用（扣除）')],["rebate",tx('收到返佣（加回）')]]} onChange={v=>set('feeMode',v as Trade['feeMode'])}/>
  <p className="field-hint" style={{gridColumn:'1 / -1',margin:0}}>{tx(guidance)} {tx('費率會依券商、商品及生效日期改變；按結算單填寫，未知項目留白，不會當成零或自行推算。')}</p>
 </div>
 <p className="field-hint">{t.market==='crypto'?tx('資金費是永續合約持倉期間支付或收到的費用；現貨與無資金費的交易可留白。自動盈虧適用線性合約。'):isFuturesMarket(t.market)?tx('期貨以口數 × 每點乘數計算；分批成交請填加權平均進出場價。'):tx('股票以股數 × 價差計算；分批成交請填加權平均進出場價。')}{t.market==='tw-index-futures'?tx('台指期每點乘數依契約不同；TXF 為 200、MXF 為 50、TMF 為 10 元，請按商品代號核對。'):''}</p>
 {t.market==='crypto'&&<div className="form-grid"><Choice label={tx('資金費方向')} value={fundingDirection} options={[["paid",tx('支付（扣除）')],["received",tx('收到（加回）')]]} onChange={v=>{setFundingDirection(v);set('funding',(v==='received'?-1:1)*Math.abs(t.funding??0));}}/><div className="form-field"><label htmlFor={`${uid}-funding`}>{tx('資金費金額（選填，')}{t.currency}）</label><Input id={`${uid}-funding`} type="number" min="0" step="any" value={t.funding===null?'':Math.abs(t.funding)} placeholder={tx('未知／不填')} onChange={e=>set('funding',e.target.value===''?null:(fundingDirection==='received'?-1:1)*Number(e.target.value))}/></div></div>}
 <p className="field-hint">{tx('未填費用保持未知，不推測、不扣除；目前損益僅計入已知費用，可稍後補上。')}</p>
 <div className="profit-entry"><div className="form-field"><label htmlFor={`${uid}-profit`}>{tx('盈虧（選填，留白自動計算）')}</label><Input id={`${uid}-profit`} type="text" inputMode="decimal" value={profitText} className={t.netOverride==null?'':t.netOverride>=0?'positive':'negative'} placeholder={tx('例如：+1000 或 -1000')} aria-invalid={Number.isNaN(t.netOverride)} onChange={e=>{setProfitText(e.target.value);set('netOverride',parseSignedAmount(e.target.value));}}/></div>
  {t.netOverride!==null&&<Choice label={tx('填入盈虧的口徑')} value={t.profitBasis??'net'} options={[["net",tx('淨盈虧：已扣費用')],["gross",tx('交易盈虧：尚未扣費用')]]} onChange={v=>set('profitBasis',v as Trade['profitBasis'])}/>}
  <p className="field-hint">{Number.isNaN(t.netOverride)?tx('請輸入有效金額，例如 +1000、-1000 或 0。'):t.netOverride===null?tx('依平均進出場價與倉位計算，扣除已知的手續費、交易稅、其他費用與資金費。'):tx('已辨識為{0}。{1}',[t.netOverride>0?tx('獲利'):t.netOverride<0?tx('虧損'):tx('打平'),t.profitBasis==='gross'?tx('將再扣除已知的手續費、交易稅、其他費用與資金費。'):tx('直接採用此淨盈虧，不會重複扣費。')])}</p></div>
 <CalculationSummary trade={t}/>
 <h3 className="review-heading">{tx('留下你的觀察')}</h3><div className="form-field"><label htmlFor={`${uid}-strategy`}>{tx('交易策略（選填）')}</label><Input id={`${uid}-strategy`} maxLength={80} value={t.strategy} placeholder={tx('沒填也可以儲存')} onChange={e=>set('strategy',e.target.value)}/></div>
 {notes&&<div className="form-field"><label htmlFor={`${uid}-notes`}>{tx('交易心得（選填）')}</label><Textarea id={`${uid}-notes`} rows={3} maxLength={10000} value={t.notes} onChange={e=>set('notes',e.target.value)} placeholder={tx('寫下這次進出場的觀察…')}/></div>}
 </>;
}
