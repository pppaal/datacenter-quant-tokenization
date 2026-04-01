import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus Seoul | AI Real Estate Underwriting Platform',
  description:
    'An AI platform for underwriting real estate assets across sectors, running scenario analysis, and automatically generating investment memos for review.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark scroll-smooth">
      <body className="antialiased">
        <div className="page-noise" />
        {children}
      </body>
    </html>
  );
}
