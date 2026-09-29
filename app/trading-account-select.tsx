'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from './language-provider';

export type TradingAccountOption = { id: string; name: string };

export default function TradingAccountSelect({ accounts, value, onChange, disabled = false }:{
 accounts: TradingAccountOption[];
 value: string;
 onChange: (id:string)=>void;
 disabled?: boolean;
}) {
 const {t:tx}=useI18n();
 return <div className="form-field trading-account-select">
  <label>{tx('儲存至交易帳號')}</label>
  <Select value={value} onValueChange={onChange} disabled={disabled||accounts.length===0}>
   <SelectTrigger aria-label={tx('儲存至交易帳號')}><SelectValue placeholder={tx('選擇交易帳號')}/></SelectTrigger>
   <SelectContent>{accounts.map(account=><SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
  </Select>
  <small>{tx('新增的交易會保存到這個帳號。')}</small>
 </div>;
}
