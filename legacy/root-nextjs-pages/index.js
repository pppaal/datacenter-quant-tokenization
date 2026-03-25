import Link from 'next/link';

export default function Home() {
  return (
    <main className="container">
      <nav className="nav">
        <strong>K-RWA Realty Chain (Next.js)</strong>
        <div className="navLinks">
          <Link href="/">랜딩</Link>
          <Link href="/assets">자산 리스트</Link>
          <Link href="/admin">관리자</Link>
        </div>
      </nav>
      <section className="section">
        <span className="badge">Next.js 전환 완료</span>
        <h1>네, Next.js로 할 수 있습니다.</h1>
        <p>기존 MVP 기능(자산 데이터 구조화, AI 투자 메모, 데이터룸 권한/업로드, 리드/관리자)을 Next.js 페이지+API로 이식했습니다.</p>
        <Link href="/assets" className="btn">자산 보러가기</Link>
      </section>
    </main>
  );
}
