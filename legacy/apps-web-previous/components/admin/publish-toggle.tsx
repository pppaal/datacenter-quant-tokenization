'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function PublishToggle({ assetId, initial }: { assetId: string; initial: boolean }) {
  const [published, setPublished] = useState(initial);
  const [msg, setMsg] = useState('');

  const toggle = async () => {
    const res = await fetch(`/api/admin/assets/${assetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !published, status: !published ? 'PUBLISHED' : 'REVIEW' })
    });
    if (!res.ok) {
      setMsg('변경 실패');
      return;
    }
    setPublished(!published);
    setMsg(!published ? 'Published' : 'Unpublished');
  };

  return (
    <div className="space-y-2">
      <Button type="button" className={published ? 'bg-orange-700' : 'bg-blue-700'} onClick={toggle}>
        {published ? 'Unpublish' : 'Publish'}
      </Button>
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </div>
  );
}
