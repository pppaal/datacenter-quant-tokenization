'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Props = {
  fundId: string;
  fundName: string;
  metrics: {
    navKrw: number;
    committedKrw: number;
    calledKrw: number;
    distributedKrw: number;
    remainingCommitmentKrw: number;
    dpiMultiple: number;
    tvpiMultiple: number;
    assetCount: number;
  };
};

function formatKrwB(value: number) {
  return `₩${(value / 1_000_000_000).toFixed(1)}B`;
}

export function InvestorReportPanel({ fundId, fundName, metrics }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function download(format: 'md' | 'json' | 'csv') {
    setDownloading(format);
    try {
      const response = await fetch(`/api/funds/${fundId}/investor-report?format=${format}`);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="(.+)"/);
      a.download = match?.[1] ?? `investor-report.${format}`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  function openHtmlReport() {
    window.open(`/api/funds/${fundId}/investor-report?format=html`, '_blank', 'noopener');
  }

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Investor Reporting</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{fundName}</h3>
          <p className="mt-2 text-sm text-slate-400">
            Generate and download investor reports with current fund metrics.
          </p>
        </div>
        <Badge tone={metrics.tvpiMultiple >= 1 ? 'good' : 'warn'}>TVPI {metrics.tvpiMultiple}x</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        {(
          [
            ['NAV', formatKrwB(metrics.navKrw)],
            ['Committed', formatKrwB(metrics.committedKrw)],
            ['Called', formatKrwB(metrics.calledKrw)],
            ['Distributed', formatKrwB(metrics.distributedKrw)],
            ['Remaining', formatKrwB(metrics.remainingCommitmentKrw)],
            ['DPI', `${metrics.dpiMultiple}x`],
            ['TVPI', `${metrics.tvpiMultiple}x`],
            ['Assets', String(metrics.assetCount)]
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="metric-card">
            <div className="fine-print">{label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => download('md')} disabled={downloading === 'md'}>
          {downloading === 'md' ? 'Generating...' : 'Download Markdown Report'}
        </Button>
        <Button variant="secondary" onClick={() => download('json')} disabled={downloading === 'json'}>
          {downloading === 'json' ? 'Generating...' : 'Download JSON Report'}
        </Button>
        <Button variant="secondary" onClick={() => download('csv')} disabled={downloading === 'csv'}>
          {downloading === 'csv' ? 'Generating...' : 'Download CSV (Excel)'}
        </Button>
        <Button variant="ghost" onClick={openHtmlReport}>
          Open Printable HTML (PDF)
        </Button>
      </div>
    </Card>
  );
}
