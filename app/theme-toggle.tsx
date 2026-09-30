'use client';
import { useI18n } from './language-provider';
import { useEffect,useState } from 'react';
import { Moon,Sun } from 'lucide-react';
import { applyThemeMode, readThemeMode, resolveThemeDark, themeChangeEvent } from '@/lib/theme';
export default function ThemeToggle(){
 const {t:tx}=useI18n();
const [dark,setDark]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const sync=()=>{const next=resolveThemeDark(readThemeMode(),media.matches);const root=document.documentElement;if(root.classList.contains('dark')!==next)root.classList.toggle('dark',next);root.style.colorScheme=next?'dark':'light';setDark(next);};sync();media.addEventListener('change',sync);window.addEventListener('storage',sync);window.addEventListener(themeChangeEvent,sync);return()=>{media.removeEventListener('change',sync);window.removeEventListener('storage',sync);window.removeEventListener(themeChangeEvent,sync);};},[]);
 function toggle(){const mode=dark?'light':'dark';applyThemeMode(mode);setDark(mode==='dark');}
 return <button type="button" className="theme-toggle" aria-label={dark?tx("切換淺色模式"):tx("切換深色模式")} title={dark?tx("切換淺色模式"):tx("切換深色模式")} aria-pressed={dark} onClick={toggle}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>;
}
