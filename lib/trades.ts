export type Trade = {
  id: string; market: 'futures' | 'crypto' | 'tw-stocks' | 'cn-stocks' | 'hk-stocks'; symbol: string; side: 'long' | 'short';
  account: string; currency: 'USD' | 'USDT' | 'TWD' | 'CNY' | 'HKD'; entryTime: string; exitTime: string;
  entry: number; exit: number; quantity: number; multiplier: number; fees: number | null;
  funding: number | null; strategy: string; notes: string; imageId: string | null;
  netOverride: number | null;
  positionValue?: number | null; leverage?: number | null;
  marginMode?: 'cross' | 'isolated' | null; profitBasis?: 'net' | 'gross';
  feeMode?: 'paid' | 'rebate'; commission?: number | null;
};
export const multipliers: Record<string, number> = { NQ:20, MNQ:2, ES:50, MES:5, YM:5, MYM:0.5, RTY:50, M2K:5, CL:1000, MCL:100, GC:100, MGC:10 };
export const marketNames:Record<Trade['market'],string>={futures:'美國期貨',crypto:'加密貨幣','tw-stocks':'台股','cn-stocks':'A股','hk-stocks':'港股'};
export const marketCurrencies:Record<Trade['market'],Trade['currency']>={futures:'USD',crypto:'USDT','tw-stocks':'TWD','cn-stocks':'CNY','hk-stocks':'HKD'};
export const marketName = (v:string) => marketNames[v as Trade['market']]??v;
export function parseSignedAmount(text:string):number|null { const value=text.trim().replaceAll('＋','+').replaceAll('−','-').replaceAll('－','-'); if(!value)return null; if(!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value))return NaN; return Number(value.replaceAll(',','')); }
export function positionValue(t:Trade) { return t.positionValue ?? t.entry*t.quantity; }
export function initialMargin(t:Trade) { return t.market==='crypto'&&t.leverage&&t.leverage>0&&positionValue(t)>0 ? positionValue(t)/t.leverage : null; }
export function grossPnl(t:Trade) { const qty=t.market==='crypto'&&t.positionValue!=null?(t.entry>0?t.positionValue/t.entry:0):t.quantity; return (t.exit-t.entry)*(t.side==='long'?1:-1)*qty*(t.market==='futures'?t.multiplier:1); }
export function feeCost(t:Trade) { return (t.feeMode==='rebate'?-1:1)*Math.abs(t.fees??0); }
export function pnl(t:Trade) { const gross=t.netOverride??grossPnl(t); return Math.round((t.netOverride!==null&&t.profitBasis!=='gross'?gross:gross-Math.abs(t.commission??0)-feeCost(t)-(t.funding??0))*100)/100; }
export function stats(trades:Trade[]) {
  const values=trades.map(pnl); const wins=values.filter(v=>v>0), losses=values.filter(v=>v<0);
  return { net:values.reduce((s,v)=>s+v,0), count:values.length, winRate:values.length?wins.length/values.length*100:0,
    avgWin:wins.length?wins.reduce((s,v)=>s+v,0)/wins.length:0, avgLoss:losses.length?losses.reduce((s,v)=>s+v,0)/losses.length:0,
    factor:losses.length?wins.reduce((s,v)=>s+v,0)/Math.abs(losses.reduce((s,v)=>s+v,0)):wins.length?Infinity:0 };
}
export function localTime(date = new Date()) {return new Date(date.getTime()+8*3600000).toISOString().slice(0,16);}
export function newTrade():Trade {return {id:crypto.randomUUID(),market:'futures',symbol:'MNQ',side:'long',account:'主要帳戶',currency:'USD',entryTime:localTime(),exitTime:localTime(),entry:0,exit:0,quantity:1,multiplier:2,fees:null,funding:null,strategy:'',notes:'',imageId:null,netOverride:null,profitBasis:'gross',commission:null};}
export function demoTrades():Trade[] {
  const month=localTime().slice(0,7);
  const rows:[number,string,'long'|'short',number,number,string][]=[
    [1,'MNQ','long',23680,23732,'突破回測'],[2,'ES','short',6550,6542,'區間反轉'],[3,'BTCUSDT','long',108000,107400,'突破回測'],
    [4,'MNQ','long',23700,23665,'突破回測'],[5,'ETHUSDT','long',4250,4365,'趨勢延續'],[7,'MNQ','short',23890,23812,'區間反轉'],
    [8,'ES','long',6582,6590,'趨勢延續'],[9,'BTCUSDT','short',110200,108900,'趨勢延續'],[10,'MNQ','long',23780,23758,'突破回測'],
    [11,'ETHUSDT','short',4410,4380,'區間反轉'],[12,'MES','long',6600,6625,'突破回測'],[14,'MNQ','long',23910,23986,'趨勢延續']];
  return rows.map((r,i)=>({id:`demo-${i}`,market:r[1].includes('USDT')?'crypto':'futures',symbol:r[1],side:r[2],account:r[1].includes('USDT')?'加密交易帳戶':'期貨交易帳戶',currency:r[1].includes('USDT')?'USDT':'USD',entryTime:`${month}-${String(r[0]).padStart(2,'0')}T21:35`,exitTime:`${month}-${String(r[0]).padStart(2,'0')}T22:10`,entry:r[3],exit:r[4],quantity:r[1]==='BTCUSDT'?0.1:r[1]==='ETHUSDT'?2:1,multiplier:multipliers[r[1]]??1,fees:r[1].includes('USDT')?4.5:2.4,funding:0,strategy:r[5],notes:i%3===0?'等待價格回測確認後進場，按原定計畫出場。下次繼續保持耐心。':i%3===1?'進場前已設定停損，沒有在盤中移動。':'進場有些急，下次等訊號完整再下單。',imageId:null,netOverride:null}));
}
