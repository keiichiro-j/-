import type { Metadata, Viewport } from 'next';
import { Noto_Sans_JP, Plus_Jakarta_Sans } from 'next/font/google';
import BottomNav from '@/components/BottomNav';
import PwaRegister from '@/components/PwaRegister';
import './globals.css';

const notoJp = Noto_Sans_JP({
  variable: '--font-noto-jp',
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'その日のコーデ',
  description:
    '天気・予定・手持ちの服からAIが今日のベストな一着を提案するパーソナルコーディネートアプリ',
  applicationName: 'その日のコーデ',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'その日のコーデ',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#12081f',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoJp.variable} ${jakarta.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">
        <PwaRegister />
        <div className="mx-auto min-h-full w-full max-w-md pb-28">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
