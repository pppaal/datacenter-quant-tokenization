import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function AssetDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [asset, setAsset] = useState(null);
  const [memo, setMemo] = useState(null);
  const [role, setRole] = useState('public');
  const [docs, setDocs] = useState([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/assets/${id}`).then((r) => r.json()).then(setAsset);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/assets/${id}/dataroom?role=${role}`).then((r) => r.json()).then((d) => setDocs(d.items || []));
  }, [id, role]);

  const generateMemo = async () => {
    const res = await fetch('/api/ai/investment-memo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetId: id })
    });
    setMemo(await res.json());
  };

  const submitLead = async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    payload.source = `next-asset:${id}`;
    const res = await fetch('/api/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    setStatus(res.ok ? '문의 저장 완료' : '문의 저장 실패');
    if (res.ok) e.currentTarget.reset();
  };

  const uploadPdf = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      fileName: fd.get('fileName'),
      category: fd.get('category'),
      visibility: fd.getAll('visibility'),
      contentBase64: btoa(unescape(encodeURIComponent(`%PDF-1.1\n${fd.get('pdfText')}\n%%EOF`)))
    };
    const res = await fetch(`/api/assets/${id}/upload`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    setStatus(res.ok ? 'PDF 업로드 완료' : 'PDF 업로드 실패');
    if (res.ok) {
      e.currentTarget.reset();
      const d = await (await fetch(`/api/assets/${id}/dataroom?role=${role}`)).json();
      setDocs(d.items || []);
    }
  };

  if (!asset) return <main className="container"><p>로딩중...</p></main>;

  return (
    <main className="container">
      <nav className="nav">
        <strong>K-RWA Realty Chain</strong>
        <div className="navLinks"><Link href="/">랜딩</Link><Link href="/assets">자산 리스트</Link><Link href="/admin">관리자</Link></div>
      </nav>

      <section className="section">
        <h1>{asset.name}</h1>
        <p className="meta">{asset.assetType} · {asset.country}/{asset.city} · {asset.address}</p>
        <p>{asset.summary}</p>
      </section>

      <section className="grid2 section">
        <article className="card">
          <h2>AI 투자 메모</h2>
          <button onClick={generateMemo}>메모 생성</button>
          <pre>{memo ? JSON.stringify(memo, null, 2) : '생성 버튼을 눌러주세요.'}</pre>
        </article>
        <article className="card">
          <h2>문의 남기기</h2>
          <form onSubmit={submitLead}>
            <input name="name" required placeholder="이름" />
            <input name="email" type="email" required placeholder="이메일" />
            <input name="interest" defaultValue={asset.name} required />
            <textarea name="message" placeholder="문의내용" />
            <button type="submit">저장</button>
          </form>
        </article>
      </section>

      <section className="grid2 section">
        <article className="card">
          <h2>데이터룸</h2>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="public">public</option>
            <option value="investor">investor</option>
            <option value="admin">admin</option>
          </select>
          <ul>{docs.map((d) => <li key={d.id}>{d.title} <span className="meta">({d.category} · {d.visibility?.join(',')})</span></li>)}</ul>
        </article>

        <article className="card">
          <h2>PDF 업로드</h2>
          <form onSubmit={uploadPdf}>
            <input name="fileName" required placeholder="파일명.pdf" />
            <input name="category" required placeholder="IM/DD/Contract/Power" />
            <select name="visibility" multiple size={3} required>
              <option value="public">public</option>
              <option value="investor">investor</option>
              <option value="admin">admin</option>
            </select>
            <textarea name="pdfText" required placeholder="PDF 텍스트(데모)" />
            <button type="submit">업로드</button>
          </form>
        </article>
      </section>
      <p className="meta">{status}</p>
    </main>
  );
}
