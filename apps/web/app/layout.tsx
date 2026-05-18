import type { Metadata, Viewport } from 'next';
import './globals.css';

const APP_NAME = 'Nexus Seoul';
const APP_TAGLINE = 'AI Real Estate Underwriting Platform';
const APP_DESCRIPTION =
  '한국 부동산 기관투자를 위한 AI 네이티브 운영 시스템. 리서치 · 언더라이팅 · IC · 포트폴리오 · 토큰화를 한 워크플로 안에서.';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://nexus-seoul.example';

export const metadata: Metadata = {
  metadataBase: new URL(APP_BASE_URL),
  title: {
    default: `${APP_NAME} | ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    '부동산 운용사 OS',
    'AI 부동산 언더라이팅',
    'Investment Memo',
    '데이터센터 투자',
    '한국 부동산',
    'IC 워크플로',
    '토큰화',
    'ERC-3643'
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    url: APP_BASE_URL,
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    siteName: APP_NAME
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} | ${APP_TAGLINE}`,
    description: APP_DESCRIPTION
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' }
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050813'
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
