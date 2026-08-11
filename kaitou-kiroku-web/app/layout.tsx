import type { Metadata, Viewport } from 'next';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import ThemeSync from '@/components/ThemeSync';
import './globals.css';

export const metadata: Metadata = {
  title: '解答記録',
  description: '資格試験の過去問演習用、解答記録・自己採点アプリ',
  applicationName: '解答記録',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '解答記録',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full" suppressHydrationWarning>
      <body className="min-h-full antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeSync />
        <div className="mx-auto min-h-full w-full max-w-[560px]">{children}</div>
      </body>
    </html>
  );
}
