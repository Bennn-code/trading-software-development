import type { Metadata } from "next";
import "./globals.css";
import "./editor.css";
import "./import.css";
import "./periods.css";
import "./reviews.css";
import "./dashboard.css";
import "./theme.css";
import "./account.css";
import "./broker-import.css";
import "./trade-status.css";
import "./card-layout.css";
import "./interaction.css";
import "./trade-ai-chat.css";
import { LanguageProvider } from './language-provider';
import { cookies } from 'next/headers';
import type { Language } from '@/lib/i18n';
import { initialLocaleResources } from '@/lib/initial-locale-resources.server';

const themeBootstrapScript = `(()=>{try{const saved=localStorage.getItem('trade-journal-theme');const dark=saved==='dark'||(saved!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';}catch{}})();`;

export const metadata: Metadata = {
  title: "交易手記｜我的交易日誌",
  description: "記錄期貨、加密貨幣與股票交易，從每一筆交易看見自己的進步。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const languageCookie = (await cookies()).get('trade-journal-language')?.value;
  const initialLanguage: Language = languageCookie === 'en' || languageCookie === 'zh-Hans' || languageCookie === 'yue-Hant' ? languageCookie : 'zh-Hant';
  return (
    <html lang={initialLanguage} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="antialiased"><LanguageProvider initialLanguage={initialLanguage} initialResources={initialLocaleResources(initialLanguage)}>{children}</LanguageProvider></body>
    </html>
  );
}
