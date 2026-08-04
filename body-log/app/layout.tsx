import type { Metadata, Viewport } from 'next';
import { Noto_Sans_JP } from 'next/font/google';
import BottomNav from '@/components/BottomNav';
import PwaRegister from '@/components/PwaRegister';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import './globals.css';

const notoJp = Noto_Sans_JP({
  variable: '--font-noto-jp',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Body Log',
  description: '食事写真をアップするだけでAIがカロリー・栄養素を推定する体系管理アプリ',
  applicationName: 'Body Log',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Body Log',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f0' },
    { media: '(prefers-color-scheme: dark)', color: '#10160f' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoJp.variable} h-full`} suppressHydrationWarning>
      <body className="min-h-full font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <PwaRegister />
        <div className="mx-auto min-h-full w-full max-w-md pb-28">{children}</div>
        <BottomNav />
      </body>
    </html>
  );
}
