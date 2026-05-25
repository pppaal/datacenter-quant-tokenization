'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AssetClass } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import type { MapProviderConfig } from '@/lib/maps/config';
import { toSentenceCase } from '@/lib/utils';

export type PropertyMapMarker = {
  id: string;
  name: string;
  assetClass: AssetClass;
  latitude: number;
  longitude: number;
  hasLiveDossier: boolean;
  screenSummary: string;
  mapPosition: { leftPct: number; topPct: number };
};

type Props = {
  markers: PropertyMapMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  config: MapProviderConfig;
};

type PixelPoint = { x: number; y: number };

// Cached SDK loaders. We inject the third-party script once per page; repeated
// mounts reuse the same in-flight promise instead of appending more tags.
let leafletPromise: Promise<unknown> | null = null;
let kakaoPromise: Promise<unknown> | null = null;

function loadLeaflet(): Promise<unknown> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet can only load in the browser'));
  }
  const existing = (window as { L?: unknown }).L;
  if (existing) return Promise.resolve(existing);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet="true"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', 'true');
      document.head.appendChild(link);
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => {
      const loaded = (window as { L?: unknown }).L;
      if (loaded) resolve(loaded);
      else reject(new Error('Leaflet loaded but window.L is missing'));
    };
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error('Leaflet script failed to load'));
    };
    document.head.appendChild(script);
  });

  return leafletPromise;
}

function loadKakao(appkey: string): Promise<unknown> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Kakao Maps can only load in the browser'));
  }
  const w = window as { kakao?: { maps?: { load?: (cb: () => void) => void } } };
  if (w.kakao?.maps) return Promise.resolve(w.kakao);
  if (kakaoPromise) return kakaoPromise;

  kakaoPromise = new Promise((resolve, reject) => {
    const finalize = () => {
      const kakao = (window as { kakao?: { maps?: { load?: (cb: () => void) => void } } }).kakao;
      if (kakao?.maps?.load) {
        kakao.maps.load(() => resolve(kakao));
      } else {
        reject(new Error('Kakao SDK loaded but kakao.maps is missing'));
      }
    };

    const existing = document.querySelector(
      'script[data-kakao="true"]'
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', finalize);
      existing.addEventListener('error', () => reject(new Error('Kakao script failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      appkey
    )}&autoload=false`;
    script.async = true;
    script.setAttribute('data-kakao', 'true');
    script.onload = finalize;
    script.onerror = () => {
      kakaoPromise = null;
      reject(new Error('Kakao script failed to load'));
    };
    document.head.appendChild(script);
  });

  return kakaoPromise;
}

function markerTone(assetClass: AssetClass, hasLiveDossier: boolean) {
  if (hasLiveDossier) return 'border-emerald-400 bg-emerald-500/30 text-emerald-100';
  if (assetClass === AssetClass.DATA_CENTER) return 'border-sky-400 bg-sky-500/30 text-sky-100';
  return 'border-amber-300 bg-amber-400/30 text-amber-100';
}

export function PropertyMap({ markers, selectedId, onSelect, config }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<{ destroy: () => void } | null>(null);
  const projectRef = useRef<((lat: number, lng: number) => PixelPoint | null) | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [pixelPositions, setPixelPositions] = useState<Record<string, PixelPoint>>({});

  const selected = useMemo(
    () => markers.find((marker) => marker.id === selectedId) ?? markers[0] ?? null,
    [markers, selectedId]
  );

  const reproject = useCallback(() => {
    const project = projectRef.current;
    if (!project) return;
    const next: Record<string, PixelPoint> = {};
    for (const marker of markers) {
      const point = project(marker.latitude, marker.longitude);
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        next[marker.id] = point;
      }
    }
    setPixelPositions(next);
  }, [markers]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || markers.length === 0) return;

    setStatus('loading');

    async function init() {
      try {
        if (config.provider === 'kakao') {
          await initKakao(container as HTMLDivElement);
        } else {
          await initLeaflet(container as HTMLDivElement);
        }
        if (cancelled) return;
        setStatus('ready');
        reproject();
      } catch {
        if (cancelled) return;
        // No network / blocked SDK / missing key: keep the surface usable by
        // falling back to the schematic grid + percentage-projected markers.
        projectRef.current = null;
        setPixelPositions({});
        setStatus('failed');
      }
    }

    async function initLeaflet(target: HTMLDivElement) {
      const L = (await loadLeaflet()) as any;
      if (cancelled) return;
      const map = L.map(target, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      const bounds = L.latLngBounds(markers.map((marker) => [marker.latitude, marker.longitude]));
      map.fitBounds(bounds, { padding: [56, 56], maxZoom: 14 });
      projectRef.current = (lat, lng) => {
        const point = map.latLngToContainerPoint([lat, lng]);
        return { x: point.x, y: point.y };
      };
      map.on('move zoom resize zoomend moveend', reproject);
      mapInstanceRef.current = {
        destroy: () => {
          map.off();
          map.remove();
        }
      };
    }

    async function initKakao(target: HTMLDivElement) {
      const kakao = (await loadKakao(config.provider === 'kakao' ? config.kakaoApiKey : '')) as any;
      if (cancelled) return;
      const map = new kakao.maps.Map(target, {
        center: new kakao.maps.LatLng(markers[0].latitude, markers[0].longitude),
        level: 9
      });
      const bounds = new kakao.maps.LatLngBounds();
      for (const marker of markers) {
        bounds.extend(new kakao.maps.LatLng(marker.latitude, marker.longitude));
      }
      map.setBounds(bounds);
      projectRef.current = (lat, lng) => {
        const projection = map.getProjection();
        const point = projection.containerPointFromCoords(new kakao.maps.LatLng(lat, lng));
        return { x: point.x, y: point.y };
      };
      kakao.maps.event.addListener(map, 'center_changed', reproject);
      kakao.maps.event.addListener(map, 'zoom_changed', reproject);
      kakao.maps.event.addListener(map, 'bounds_changed', reproject);
      mapInstanceRef.current = {
        destroy: () => {
          target.innerHTML = '';
        }
      };
    }

    void init();

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => reproject()) : null;
    observer?.observe(container);

    return () => {
      cancelled = true;
      observer?.disconnect();
      projectRef.current = null;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
    };
  }, [config, markers, reproject]);

  const providerLabel =
    status === 'ready'
      ? config.provider === 'kakao'
        ? 'Kakao map'
        : 'OpenStreetMap'
      : status === 'loading'
        ? 'Loading map...'
        : 'Schematic view';

  return (
    <div className="relative min-h-[480px] overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_38%),linear-gradient(180deg,rgba(8,47,73,0.65),rgba(15,23,42,0.92))]">
      <div ref={containerRef} className="absolute inset-0 z-0 h-full w-full" aria-hidden="true" />

      {status !== 'ready' ? (
        <div className="pointer-events-none absolute inset-0 z-[1] opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:54px_54px]" />
      ) : null}

      <div className="pointer-events-none absolute left-6 top-6 z-20 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs uppercase tracking-[0.28em] text-slate-300">
          Seoul / Incheon / Pangyo screen
        </span>
        <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-slate-400">
          {providerLabel}
        </span>
      </div>

      {markers.map((marker) => {
        const pixel = pixelPositions[marker.id];
        const style = pixel
          ? { left: `${pixel.x}px`, top: `${pixel.y}px` }
          : { left: `${marker.mapPosition.leftPct}%`, top: `${marker.mapPosition.topPct}%` };
        const isSelected = selected ? marker.id === selected.id : false;
        return (
          <button
            key={marker.id}
            type="button"
            onClick={() => onSelect(marker.id)}
            className={`absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_0_0_8px_rgba(15,23,42,0.28)] transition ${markerTone(
              marker.assetClass,
              marker.hasLiveDossier
            )} ${isSelected ? 'scale-125 ring-2 ring-white/70' : 'hover:scale-110'}`}
            style={style}
            aria-label={marker.name}
            data-testid="property-explorer-marker"
          />
        );
      })}

      {selected ? (
        <div className="pointer-events-none absolute bottom-6 left-6 right-6 z-20 grid gap-3 rounded-[24px] border border-white/10 bg-slate-950/80 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="fine-print">Selected candidate</div>
              <div className="mt-2 text-xl font-semibold text-white">{selected.name}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{toSentenceCase(selected.assetClass)}</Badge>
              <Badge tone={selected.hasLiveDossier ? 'good' : 'warn'}>
                {selected.hasLiveDossier ? 'Live dossier' : 'Bootstrap ready'}
              </Badge>
            </div>
          </div>
          <p className="text-sm leading-7 text-slate-300">{selected.screenSummary}</p>
        </div>
      ) : null}
    </div>
  );
}
