'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Inquiry = {
  id: string;
  name: string;
  company: string;
  email: string;
  message: string;
  status: 'NEW' | 'REVIEWING' | 'CLOSED';
  asset?: { name: string } | null;
};

export function InquiriesTable({ initial }: { initial: Inquiry[] }) {
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState('');

  const updateStatus = async (id: string, status: Inquiry['status']) => {
    const res = await fetch(`/api/admin/inquiries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });

    if (!res.ok) {
      setMsg('상태 업데이트 실패');
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setMsg('상태 업데이트 완료');
  };

  return (
    <div className="grid gap-3">
      {rows.length === 0 && <Card>No inquiries yet.</Card>}
      {rows.map((q) => (
        <Card key={q.id}>
          <p className="text-sm">{q.name} · {q.company} · {q.email}</p>
          <p className="text-xs text-slate-400">{q.asset?.name || 'general inquiry'} · {q.status}</p>
          <p className="mb-2 text-sm text-slate-300">{q.message}</p>
          <div className="flex gap-2">
            <Button type="button" className="bg-slate-700" onClick={() => updateStatus(q.id, 'NEW')}>NEW</Button>
            <Button type="button" className="bg-yellow-700" onClick={() => updateStatus(q.id, 'REVIEWING')}>REVIEWING</Button>
            <Button type="button" className="bg-green-700" onClick={() => updateStatus(q.id, 'CLOSED')}>CLOSED</Button>
          </div>
        </Card>
      ))}
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </div>
  );
}
