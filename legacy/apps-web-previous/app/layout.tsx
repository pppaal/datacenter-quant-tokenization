import './globals.css';
import { ReactNode } from 'react';

export const metadata = {
  title: 'Korea Data Center Deal Review Platform',
  description: 'B2B 데이터센터 딜 검토/소개 플랫폼 MVP'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
