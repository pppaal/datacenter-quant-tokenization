import { Card } from '@/components/ui/card';
import type { SampleReportData } from './types';

export function SiteMediaSection({ data }: { data: SampleReportData }) {
  const { asset } = data;
  if (!(asset.media && asset.media.length > 0)) {
    return null;
  }
  return (
    <section className="app-shell py-4">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Site media</div>
            <p className="mt-2 text-sm text-slate-400">
              Photos, site plans, and renders. Curated by the deal lead — same set the IM cover and
              committee pack draw from.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {asset.media.length} item{asset.media.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {asset.media.map((m) => (
            <figure
              key={m.id}
              className="overflow-hidden rounded-[18px] border border-white/10 bg-slate-950/60"
            >
              <div className="aspect-video w-full bg-slate-900">
                {m.mimeType.startsWith('image/') ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/api/public/asset-media/${m.id}`}
                    alt={m.caption ?? m.kind}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                    {m.mimeType}
                  </div>
                )}
              </div>
              <figcaption className="space-y-1 p-3">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">{m.kind}</div>
                {m.caption ? <div className="text-sm text-slate-200">{m.caption}</div> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </section>
  );
}
