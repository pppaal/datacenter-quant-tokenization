'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type MediaItem = {
  id: string;
  kind: string;
  caption: string | null;
  sortOrder: number;
  mimeType: string;
  sizeBytes: number;
};

const KINDS = ['HERO', 'EXTERIOR', 'INTERIOR', 'SITE_PLAN', 'FLOORPLAN', 'RENDER', 'DRONE'] as const;

export function AssetMediaManager({
  assetId,
  initialMedia
}: {
  assetId: string;
  initialMedia: MediaItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<MediaItem[]>(initialMedia);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);

  const [kind, setKind] = useState<(typeof KINDS)[number]>('HERO');
  const [caption, setCaption] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [file, setFile] = useState<File | null>(null);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setBanner({ tone: 'warn', text: 'Choose a file first.' });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      if (caption.trim()) fd.append('caption', caption.trim());
      fd.append('sortOrder', sortOrder || '0');
      const res = await fetch(`/api/assets/${assetId}/media`, { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Upload failed (${res.status})`);
      }
      const created = (await res.json()) as MediaItem & { ok: true };
      setItems((prev) =>
        [...prev, {
          id: created.id,
          kind: created.kind,
          caption: created.caption,
          sortOrder: created.sortOrder,
          mimeType: created.mimeType,
          sizeBytes: created.sizeBytes
        }].sort((a, b) => a.sortOrder - b.sortOrder)
      );
      setBanner({ tone: 'good', text: 'Uploaded.' });
      setFile(null);
      setCaption('');
      router.refresh();
    } catch (err) {
      setBanner({
        tone: 'warn',
        text: err instanceof Error ? err.message : 'Upload failed'
      });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this media item?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/media/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }
      setItems((prev) => prev.filter((m) => m.id !== id));
      setBanner({ tone: 'good', text: 'Deleted.' });
      router.refresh();
    } catch (err) {
      setBanner({
        tone: 'warn',
        text: err instanceof Error ? err.message : 'Delete failed'
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {banner ? (
        <div
          className={`rounded-[14px] border px-4 py-2 text-sm ${
            banner.tone === 'good'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-200'
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <form onSubmit={upload} className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            className="rounded-[12px] border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Caption
          <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="optional" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Sort order
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          File
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-200"
          />
        </label>
        <div className="md:col-span-4">
          <Button type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No media uploaded yet.</p>
        ) : (
          items.map((m) => (
            <div
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
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge>{m.kind}</Badge>
                  <span className="text-[10px] text-slate-500">
                    {(m.sizeBytes / 1024).toFixed(0)} KB
                  </span>
                </div>
                {m.caption ? (
                  <p className="text-sm text-slate-300">{m.caption}</p>
                ) : null}
                <button
                  onClick={() => remove(m.id)}
                  disabled={busy}
                  className="text-xs text-rose-300 hover:text-rose-200 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
