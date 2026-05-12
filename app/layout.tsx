import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "平和艇AI — 平和島ボートレース AI予想",
  description: "AIが平和島ボートレースの出走データを解析し、リアルタイムで予想スコアを提供します。展示タイム・勝率・コース特性を総合スコアで可視化。",
  openGraph: {
    title: "平和艇AI — 平和島ボートレース AI予想",
    description: "AIが平和島ボートレースの出走データを解析。展示タイム・勝率・コース特性を総合スコアで可視化します。",
    type: "website",
    url: "https://heiwa-tei.com",
    siteName: "平和艇AI",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "平和艇AI — 平和島ボートレース AI予想",
    description: "AIが平和島ボートレースの出走データを解析。展示タイム・勝率・コース特性を総合スコアで可視化します。",
  },
  metadataBase: new URL("https://heiwa-tei.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
