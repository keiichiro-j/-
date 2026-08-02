import type { Metadata, Viewport } from 'next';
import { Noto_Sans_JP, Noto_Serif_JP } from 'next/font/google';
import BottomNav from '@/components/BottomNav';
import PwaRegister from '@/components/PwaRegister';
import './globals.css';

const notoJp = Noto_Sans_JP({
  variable: '--font-noto-jp',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

const notoSerifJp = Noto_Serif_JP({
  variable: '--font-serif-jp',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'コーディネーター',
  description:
    '天気・予定・手持ちの服からAIが今日のベストな一着を提案するパーソナルコーディネートアプリ',
  applicationName: 'コーディネーター',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'コーディネーター',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f5f0',
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoJp.variable} ${notoSerifJp.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <PwaRegister />
        <div className="mx-auto min-h-full w-full max-w-md pb-28">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
