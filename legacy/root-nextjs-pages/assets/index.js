import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function AssetsPage() {
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    fetch('/api/assets')
      .then((res) => res.json())
      .then((data) => setAssets(data.items || []));
  }, []);

  return (
    <main className="container">
      <nav className="nav">
        <strong>K-RWA Realty Chain</strong>
        <div className="navLinks">
          <Link href="/">랜딩</Link>
          <Link href="/assets">자산 리스트</Link>
          <Link href="/admin">관리자</Link>
        </div>
      </nav>
      <section className="section">
        <h1>자산 리스트</h1>
        <div className="grid2">
          {assets.map((asset) => (
            <article className="card" key={asset.id}>
              <p className="meta">{asset.assetType} · {asset.country}/{asset.city} · {asset.status}</p>
              <h3>{asset.name}</h3>
              <p>{asset.summary}</p>
              <p className="meta">{asset.powerCapacityMW}MW · GFA {asset.grossFloorArea?.toLocaleString()}㎡ · IRR {asset.expectedIRR}</p>
              <Link className="btn" href={`/assets/${asset.id}`}>상세 보기</Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
