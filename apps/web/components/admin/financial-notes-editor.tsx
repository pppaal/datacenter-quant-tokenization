'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type FinancialNoteView = {
  id: string;
  noteKey: string;
  title: string;
  body: string;
  orderIndex: number;
};

type Props = {
  fundId?: string;
  assetId?: string;
  notes: FinancialNoteView[];
  /** When false, render read-only (no add/edit/delete controls). */
  canEdit?: boolean;
};

/**
 * Financial-statement notes (주석) viewer + inline editor. Reads render for
 * everyone; ANALYST+ can add / edit / delete via /api/admin/financial-notes.
 * Mutations refresh the server component so the list stays authoritative.
 */
export function FinancialNotesEditor({ fundId, assetId, notes, canEdit = true }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ title: string; body: string }>({ title: '', body: '' });
  const [error, setError] = useState<string | null>(null);

  async function save(id?: string) {
    setError(null);
    const res = await fetch('/api/admin/financial-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        id,
        fundId,
        assetId,
        noteKey: (draft.title || 'note').toLowerCase().replace(/\s+/g, '-').slice(0, 60),
        title: draft.title,
        body: draft.body,
        orderIndex: id ? undefined : notes.length
      })
    });
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? '저장 실패');
      return;
    }
    setEditing(null);
    setDraft({ title: '', body: '' });
    startTransition(() => router.refresh());
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/financial-notes/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    if (!res.ok) {
      setError('삭제 실패');
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow">주석 (Notes)</div>
        {canEdit ? (
          <div className="print:hidden">
            <Button
              variant="secondary"
              onClick={() => {
                setEditing('new');
                setDraft({ title: '', body: '' });
              }}
              disabled={pending}
            >
              주석 추가
            </Button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-xs text-[hsl(var(--danger))]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {notes.length === 0 && editing !== 'new' ? (
          <p className="text-sm text-[hsl(var(--foreground-muted))]">등록된 주석이 없습니다.</p>
        ) : null}

        {notes.map((n) =>
          editing === n.id ? (
            <NoteForm
              key={n.id}
              draft={draft}
              setDraft={setDraft}
              onSave={() => save(n.id)}
              onCancel={() => setEditing(null)}
              pending={pending}
            />
          ) : (
            <div key={n.id} className="rounded-[12px] border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-[hsl(var(--foreground))]">{n.title}</div>
                {canEdit ? (
                  <div className="flex gap-2 print:hidden">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEditing(n.id);
                        setDraft({ title: n.title, body: n.body });
                      }}
                      disabled={pending}
                    >
                      편집
                    </Button>
                    <Button variant="ghost" onClick={() => remove(n.id)} disabled={pending}>
                      삭제
                    </Button>
                  </div>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[hsl(var(--foreground-muted))]">
                {n.body}
              </p>
            </div>
          )
        )}

        {editing === 'new' ? (
          <NoteForm
            draft={draft}
            setDraft={setDraft}
            onSave={() => save()}
            onCancel={() => setEditing(null)}
            pending={pending}
          />
        ) : null}
      </div>
    </Card>
  );
}

function NoteForm({
  draft,
  setDraft,
  onSave,
  onCancel,
  pending
}: {
  draft: { title: string; body: string };
  setDraft: (d: { title: string; body: string }) => void;
  onSave: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[hsl(var(--accent))] bg-[hsl(var(--accent-tint))] p-4 print:hidden">
      <input
        className="w-full rounded-md border border-border bg-panel px-3 py-2 text-sm"
        placeholder="제목 (예: 주석 03 — 투자부동산)"
        value={draft.title}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
      />
      <textarea
        className="mt-2 h-28 w-full rounded-md border border-border bg-panel px-3 py-2 text-sm"
        placeholder="내용"
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
      />
      <div className="mt-2 flex gap-2">
        <Button onClick={onSave} disabled={pending || !draft.title || !draft.body}>
          저장
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          취소
        </Button>
      </div>
    </div>
  );
}
