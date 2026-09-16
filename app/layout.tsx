import type { Metadata } from "next";
import "./globals.css";
import "./editor.css";
import "./import.css";
import "./periods.css";
import "./reviews.css";
import "./dashboard.css";
import "./theme.css";
import "./account.css";
import { LanguageProvider } from './language-provider';

export const metadata: Metadata = {
  title: "交易手記｜我的交易日誌",
  description: "記錄美國期貨與加密貨幣交易，從每一筆交易看見自己的進步。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased"><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
