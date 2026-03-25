'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ReportGenerateForm({ assets }: { assets: { id: string; name: string }[] }) {
  const [result, setResult] = useState('');

  const run = async (endpoint: string, reportType: string, assetId: string) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId, reportType })
    });
    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
  };

  return (
    <form
      className="grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const assetId = String(fd.get('assetId'));
        await run('/api/admin/reports/generate', 'investment_memo', assetId);
      }}
    >
      <select name="assetId" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
        {assets.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <Button type="submit">AI Memo 생성</Button>
        <Button
          type="button"
          className="bg-indigo-700"
          onClick={async () => {
            const select = document.querySelector('select[name="assetId"]') as HTMLSelectElement | null;
            if (!select) return;
            await run('/api/admin/reports/valuation', 'asset_valuation', select.value);
          }}
        >
          NASA+변수 기반 가치추정
        </Button>
      </div>

      <pre>{result || '생성 결과가 여기에 표시됩니다.'}</pre>
    </form>
  );
}
