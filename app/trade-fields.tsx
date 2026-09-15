'use client';
import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { initialMargin, multipliers, parseSignedAmount, pnl, positionValue, type Trade } from '@/lib/trades';

export function Choice({label,value,options,onChange}:{label:string;value:string;options:[string,string][];onChange:(s:string)=>void}) {
 return <div className="form-field"><label>{label}</label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue/></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>;
}
const fmt=(n:number)=>Number.isFinite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
export function CalculationSummary({trade:t}:{trade:Trade}) {
 const margin=initialMargin(t),profit=pnl(t),returnRate=margin&&margin>0?profit/margin*100:null;
 return <div className="calculation-summary" aria-live="polite">{t.market==='crypto'&&<><div><span>進場倉位金額</span><strong>{fmt(positionValue(t))} {t.currency}</strong></div><div><span>估算初始保證金</span><strong>{margin===null?'填寫槓桿後計算':`${fmt(margin)} ${t.currency}`}</strong></div></>}<div><span>{t.netOverride!==null?'依填寫盈虧計算':'自動計算淨盈虧'}</span><strong className={profit>=0?'positive':'negative'}>{profit>0?'+':''}{fmt(profit)} {t.currency}</strong></div>{returnRate!==null&&<div><span>估算保證金報酬率</span><strong className={profit>=0?'positive':'negative'}>{returnRate>0?'+':''}{fmt(returnRate)}%</strong></div>}{t.market==='crypto'&&<p>以進場倉位金額 ÷ 槓桿估算，不含交易所額外費用或追加保證金。{t.marginMode==='cross'?'全倉共用帳戶資金，此數值不代表最大損失或實際占用資金。':''}</p>}</div>;
}
export default function TradeFields({trade:t,onChange,notes=true}:{trade:Trade;onChange:(t:Trade)=>void;notes?:boolean}) {
 const uid=useId(),[profitText,setProfitText]=useState(t.netOverride===null?'':String(t.netOverride)),[fundingDirection,setFundingDirection]=useState(t.funding<0?'received':'paid');
 useEffect(()=>{setProfitText(t.netOverride===null?'':String(t.netOverride));setFundingDirection(t.funding<0?'received':'paid');},[t.id]);
 const set=<K extends keyof Trade>(key:K,value:Trade[K])=>onChange({...t,[key]:value});
 function numeric(key:'entry'|'exit'|'quantity'|'multiplier'|'fees',value:number) { const next={...t,[key]:key==='fees'?Math.abs(value):value}; if(t.market==='crypto'){next.positionValue=positionValue(t);next.quantity=next.entry>0?next.positionValue/next.entry:0;} onChange(next); }
 const numberField=(key:'entry'|'exit'|'quantity'|'multiplier'|'fees',label:string)=><div className="form-field" key={key}><label htmlFor={`${uid}-${key}`}>{label}</label><Input id={`${uid}-${key}`} type="number" required={key!=='fees'} step={key==='quantity'&&t.market==='futures'?'1':'any'} min="0" value={(key==='fees'?Math.abs(t[key]):t[key])||''} placeholder={key==='fees'?'0（選填）':'請填寫'} onChange={e=>numeric(key,Number(e.target.value))}/></div>;
 return <><div className="form-grid">
 <Choice label="市場" value={t.market} options={[["futures","美國期貨"],["crypto","加密貨幣"]]} onChange={v=>onChange({...t,market:v as Trade['market'],symbol:v==='futures'?'MNQ':'BTCUSDT',multiplier:v==='futures'?2:1,currency:v==='futures'?'USD':'USDT',quantity:v==='futures'?1:0,positionValue:v==='crypto'?0:null,leverage:null,marginMode:null,funding:0})}/>
 <div className="form-field"><label htmlFor={`${uid}-symbol`}>商品代號</label><Input id={`${uid}-symbol`} required maxLength={30} value={t.symbol} placeholder="MNQ / BTCUSDT" onChange={e=>{const symbol=e.target.value.toUpperCase();onChange({...t,symbol,multiplier:t.market==='futures'?(multipliers[symbol]??t.multiplier):1});}}/></div>
 <Choice label="交易方向" value={t.side} options={[["long","做多 Long"],["short","做空 Short"]]} onChange={v=>set('side',v as Trade['side'])}/>
 <Choice label="計價幣別" value={t.currency} options={[["USD","USD 美元"],["USDT","USDT"]]} onChange={v=>set('currency',v as Trade['currency'])}/>
 <div className="form-field wide"><label htmlFor={`${uid}-account`}>帳戶名稱</label><Input id={`${uid}-account`} required maxLength={80} value={t.account} onChange={e=>set('account',e.target.value)} placeholder="例如：Binance 主帳戶"/></div>
 {(['entryTime','exitTime'] as const).map((key,i)=><div className="form-field" key={key}><label htmlFor={`${uid}-${key}`}>{i?'出場時間':'進場時間'}（台北）</label><Input id={`${uid}-${key}`} type="datetime-local" required value={t[key]} onChange={e=>set(key,e.target.value)}/></div>)}
 {numberField('entry','平均進場價')}{numberField('exit','平均出場價')}
 {t.market==='futures'?<>{numberField('quantity','口數')}{numberField('multiplier','每點乘數')}</>:<>
 <div className="form-field wide"><label htmlFor={`${uid}-value`}>進場倉位金額（{t.currency}）</label><Input id={`${uid}-value`} required type="number" min="0" step="any" value={positionValue(t)||''} placeholder="例如：1,000" onChange={e=>{const value=Number(e.target.value);onChange({...t,positionValue:value,quantity:t.entry>0?value/t.entry:0,multiplier:1});}}/></div>
 <Choice label="保證金模式" value={t.marginMode??'unknown'} options={[["unknown","尚未填寫"],["cross","全倉"],["isolated","逐倉"]]} onChange={v=>set('marginMode',v==='unknown'?null:v as Trade['marginMode'])}/>
 <div className="form-field"><label htmlFor={`${uid}-leverage`}>槓桿倍數</label><Input id={`${uid}-leverage`} type="number" min="1" max="1000" step="any" value={t.leverage??''} placeholder="例如：10" onChange={e=>set('leverage',e.target.value===''?null:Number(e.target.value))}/></div>
 </>}
 <Choice label="手續費方向" value={t.feeMode??'paid'} options={[["paid","支付手續費（扣除）"],["rebate","收到返佣（加回）"]]} onChange={v=>set('feeMode',v as Trade['feeMode'])}/>{numberField('fees',`手續費金額（${t.currency}）`)}<p className="field-hint" style={{gridColumn:'1 / -1',margin:0}}>金額填正數，由方向決定扣除或加回。帳單上的負號若代表扣款，請選「支付手續費」。</p>
 {t.market==='crypto'&&<><Choice label="資金費方向" value={fundingDirection} options={[["paid","支付（扣除）"],["received","收到（加回）"]]} onChange={v=>{setFundingDirection(v);set('funding',(v==='received'?-1:1)*Math.abs(t.funding));}}/><div className="form-field wide"><label htmlFor={`${uid}-funding`}>資金費金額（選填，{t.currency}）</label><Input id={`${uid}-funding`} type="number" min="0" step="any" value={Math.abs(t.funding)||''} placeholder="0" onChange={e=>set('funding',(fundingDirection==='received'?-1:1)*Number(e.target.value))}/></div></>}
 </div>
 <p className="field-hint">{t.market==='crypto'?'資金費是永續合約持倉期間支付或收到的費用；現貨與無資金費的交易可留白。自動盈虧適用線性合約。':'期貨以口數 × 每點乘數計算；分批成交請填加權平均進出場價。'}</p>
 <div className="profit-entry"><div className="form-field"><label htmlFor={`${uid}-profit`}>盈虧（選填，留白自動計算）</label><Input id={`${uid}-profit`} type="text" inputMode="decimal" value={profitText} placeholder="例如：+1000 或 -1000" aria-invalid={Number.isNaN(t.netOverride)} onChange={e=>{setProfitText(e.target.value);set('netOverride',parseSignedAmount(e.target.value));}}/></div>
 {t.netOverride!==null&&<Choice label="填入盈虧的口徑" value={t.profitBasis??'net'} options={[["net","淨盈虧：已扣費用"],["gross","交易盈虧：尚未扣費用"]]} onChange={v=>set('profitBasis',v as Trade['profitBasis'])}/>}
 <p className="field-hint">{Number.isNaN(t.netOverride)?'請輸入有效金額，例如 +1000、-1000 或 0。':t.netOverride===null?'依平均進出場價與倉位計算，扣除手續費與支付的資金費。':`已辨識為${t.netOverride>0?'獲利':t.netOverride<0?'虧損':'打平'}。${t.profitBasis==='gross'?'將再扣除手續費及資金費。':'直接採用此淨盈虧，不會重複扣費。'}`}</p></div>
 <CalculationSummary trade={t}/>
 <h3 className="review-heading">留下你的觀察</h3><div className="form-field"><label htmlFor={`${uid}-strategy`}>交易策略（選填）</label><Input id={`${uid}-strategy`} maxLength={80} value={t.strategy} placeholder="沒填也可以儲存" onChange={e=>set('strategy',e.target.value)}/></div>
 {notes&&<div className="form-field"><label htmlFor={`${uid}-notes`}>交易心得（選填）</label><Textarea id={`${uid}-notes`} rows={3} maxLength={10000} value={t.notes} onChange={e=>set('notes',e.target.value)} placeholder="寫下這次進出場的觀察…"/></div>}
 </>;
}
