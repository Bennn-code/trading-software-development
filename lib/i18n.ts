export type Language = 'zh-Hant' | 'zh-Hans' | 'yue-Hant' | 'en';
export type Translator = (text:string,values?:unknown[])=>string;
type Resources={simplified?:(text:string)=>string;english?:Record<string,string>;cantonese?:Record<string,string>};

export function validLanguage(value: unknown): value is Language { return value === 'zh-Hant' || value === 'zh-Hans' || value === 'yue-Hant' || value === 'en'; }

function translateWith(text:string,language:Language,values:unknown[],resources:Resources){
  let translated = language === 'zh-Hans' ? resources.simplified?.(text) ?? text : language === 'yue-Hant' ? resources.cantonese?.[text] ?? text : language === 'en' ? resources.english?.[text] ?? text : text;
  if (language === 'en' && resources.english && !resources.english[text]) {
    const ordinals: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5 };
    translated = text.replace(/^(\d{4})\/(\d{1,2})月第([一二三四五])週$/, (_, y, m, n) => `${y}/${m} · Week ${ordinals[n]}`)
      .replace(/^(\d{4})年第([一二三四])季$/, (_, y, n) => `${y} Q${ordinals[n]}`)
      .replace(/^(\d{4})年$/, '$1');
  }
  return translated.replace(/\{(\d+)\}/g, (match, n) => Number(n) < values.length ? String(values[Number(n)] ?? '') : match);
}

export function translate(text:string,language:Language,values:unknown[]=[]){return translateWith(text,language,values,{});}

export async function loadTranslator(language:Language):Promise<Translator>{
  if(language==='zh-Hant')return (text,values=[])=>translateWith(text,language,values,{});
  if(language==='zh-Hans'){
    const {Converter}=await import('opencc-js/t2cn');
    const simplified=Converter({from:'tw',to:'cn'});
    return (text,values=[])=>translateWith(text,language,values,{simplified});
  }
  if(language==='en'){
    const [{default:english},{legalEnglish}]=await Promise.all([import('./locales/en.json'),import('./locales/legal')]);
    const dictionary={...english,...legalEnglish} as Record<string,string>;
    return (text,values=[])=>translateWith(text,language,values,{english:dictionary});
  }
  const [{default:cantonese},{legalCantonese}]=await Promise.all([import('./locales/yue.json'),import('./locales/legal')]);
  const dictionary={...cantonese,...legalCantonese} as Record<string,string>;
  return (text,values=[])=>translateWith(text,language,values,{cantonese:dictionary});
}
