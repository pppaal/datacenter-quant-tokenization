import { SiteHeader } from '@/components/layout/site-header';
import { prisma } from '@/lib/db/prisma';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

export default async function AssetsPage({
  searchParams
}: {
  searchParams?: { q?: string; city?: string; assetType?: string };
}) {
  const q = searchParams?.q?.trim() || '';
  const city = searchParams?.city?.trim() || '';
  const assetType = searchParams?.assetType?.trim() || '';

  const assets = await prisma.asset.findMany({
    where: {
      isPublished: true,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }] } : {}),
      ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      ...(assetType ? { assetType: { contains: assetType, mode: 'insensitive' } } : {})
    },
    orderBy: { updatedAt: 'desc' }
  });

  return (
    <>
      <SiteHeader />
      <main className="space-y-4">
        <h1 className="text-2xl font-semibold">Asset Deal Review Catalog</h1>
        <p className="text-sm text-slate-400">기관/전문투자자 검토용 정보입니다. 공개 모집·수익 보장 표현을 제공하지 않습니다.</p>

        <form className="grid gap-2 rounded-xl border border-slate-800 bg-panel p-4 md:grid-cols-4">
          <input name="q" defaultValue={q} placeholder="Search by name/summary" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" />
          <input name="city" defaultValue={city} placeholder="City" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" />
          <input name="assetType" defaultValue={assetType} placeholder="Asset Type" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" />
          <button type="submit" className="rounded-md bg-accent px-4 py-2">Apply</button>
        </form>

        <div className="grid gap-4 md:grid-cols-2">
          {assets.length === 0 && <Card>검색 조건에 해당하는 자산이 없습니다.</Card>}
          {assets.map((asset) => (
            <Card key={asset.id}>
              <p className="text-xs text-slate-400">{asset.assetType} · {asset.city}</p>
              <h2 className="text-lg font-semibold">{asset.name}</h2>
              {asset.isSample && <p className="text-xs text-amber-300">DEMO/SAMPLE DATA</p>}
              <p className="text-sm text-slate-300">{asset.summary}</p>
              <Link className="text-sm text-blue-300" href={`/assets/${asset.slug}`}>상세 보기</Link>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
