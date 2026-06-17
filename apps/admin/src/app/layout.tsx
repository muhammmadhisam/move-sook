import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Self-hosted via next/font (no render-blocking request to fonts.googleapis.com).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const notoThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-noto-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MoveSook Admin',
  description: 'แผงควบคุมผู้ดูแลระบบ MoveSook',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${notoThai.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
