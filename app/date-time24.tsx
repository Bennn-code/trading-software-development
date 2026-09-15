'use client';
import { Input } from '@/components/ui/input';
export default function DateTime24({value,onChange,label,id,disabled=false}:{value:string;onChange:(value:string)=>void;label:string;id?:string;disabled?:boolean}){
 const [date='',time='']=value.split('T');
 return <div className="datetime24"><Input id={id} type="date" aria-label={`${label}日期`} value={date} disabled={disabled} onChange={e=>onChange(`${e.target.value}T${time}`)}/><Input type="text" inputMode="numeric" aria-label={`${label}時間（24 小時制）`} placeholder="HH:mm" maxLength={5} value={time} disabled={disabled} onChange={e=>onChange(`${date}T${e.target.value}`)} onBlur={()=>{const match=time.match(/^(\d{1,2}):?(\d{2})$/);if(match&&Number(match[1])<24&&Number(match[2])<60)onChange(`${date}T${match[1].padStart(2,'0')}:${match[2]}`);}}/><span>24 時制</span></div>;
}
