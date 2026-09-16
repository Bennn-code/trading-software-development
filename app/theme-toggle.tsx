'use client';
import { useEffect,useState } from 'react';
import { Moon,Sun } from 'lucide-react';
export default function ThemeToggle(){const [dark,setDark]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const sync=()=>{let saved:string|null=null;try{saved=localStorage.getItem('trade-journal-theme');}catch{}const next=saved?saved==='dark':media.matches;setDark(next);document.documentElement.classList.toggle('dark',next);};sync();media.addEventListener('change',sync);window.addEventListener('storage',sync);return()=>{media.removeEventListener('change',sync);window.removeEventListener('storage',sync);};},[]);
 function toggle(){const next=!dark;setDark(next);document.documentElement.classList.toggle('dark',next);try{localStorage.setItem('trade-journal-theme',next?'dark':'light');}catch{}}
 return <button type="button" className="theme-toggle" aria-label={dark?'切換淺色模式':'切換深色模式'} title={dark?'切換淺色模式':'切換深色模式'} aria-pressed={dark} onClick={toggle}>{dark?<Sun size={19}/>:<Moon size={19}/>}</button>;
}
