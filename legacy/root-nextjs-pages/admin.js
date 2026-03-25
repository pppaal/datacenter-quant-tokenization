import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    fetch('/api/admin/summary').then((r) => r.json()).then(setSummary);
  }, []);

  if (!summary) return <main className="container"><p>로딩중...</p></main>;

  return (
    <main className="container">
      <nav className="nav">
        <strong>K-RWA Realty Chain</strong>
        <div className="navLinks"><Link href="/">랜딩</Link><Link href="/assets">자산 리스트</Link><Link href="/admin">관리자</Link></div>
      </nav>
      <section className="section grid3">
        <article className="card"><p className="meta">총 리드</p><p className="kpi">{summary.kpi.totalLeads}</p></article>
        <article className="card"><p className="meta">오늘 리드</p><p className="kpi">{summary.kpi.todayLeads}</p></article>
        <article className="card"><p className="meta">등록 자산</p><p className="kpi">{summary.kpi.assetsCount}</p></article>
      </section>
      <section className="section grid2">
        <article className="card"><h2>관심 자산 분포</h2><pre>{JSON.stringify(summary.byInterest, null, 2)}</pre></article>
        <article className="card"><h2>최근 문의</h2>{summary.recentLeads.map((l)=><div key={l.id}><strong>{l.name}</strong> ({l.email})<br/><span className="meta">{l.interest} · {l.status}</span></div>)}</article>
      </section>
    </main>
  );
}
