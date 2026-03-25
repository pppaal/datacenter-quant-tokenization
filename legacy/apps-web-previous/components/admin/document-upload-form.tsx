'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function DocumentUploadForm({ assets }: { assets: { id: string; name: string }[] }) {
  const [status, setStatus] = useState('');
  return (
    <form className="grid gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const file = fd.get('file') as File;
      const body = new FormData();
      body.append('file', file);
      body.append('assetId', String(fd.get('assetId')));
      body.append('title', String(fd.get('title')));
      body.append('visibility', String(fd.get('visibility')));
      const res = await fetch('/api/admin/documents/upload', { method: 'POST', body });
      setStatus(res.ok ? '문서 업로드 완료' : '문서 업로드 실패');
    }}>
      <select name="assetId" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
        {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <Input name="title" placeholder="문서 제목" required />
      <select name="visibility" className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2">
        <option value="public">public</option>
        <option value="admin">admin</option>
      </select>
      <input name="file" type="file" accept="application/pdf" required />
      <Button type="submit">업로드</Button>
      {status && <p className="text-sm text-slate-300">{status}</p>}
    </form>
  );
}
