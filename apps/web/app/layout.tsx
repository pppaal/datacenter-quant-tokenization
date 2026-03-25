import type { Metadata } from 'next';
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';

const sans = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans'
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono'
});

export const metadata: Metadata = {
  title: 'Nexus Seoul | AI Real Estate Underwriting Platform',
  description:
    'An AI platform for underwriting real estate assets across sectors, running scenario analysis, and automatically generating investment memos for review.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark scroll-smooth">
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <div className="page-noise" />
        {children}
      </body>
    </html>
  );
}
