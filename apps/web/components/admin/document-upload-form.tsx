'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DocumentType } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { documentUploadSchema, type DocumentUploadInput } from '@/lib/validations/document';

export function DocumentUploadForm({ assetId, dealId }: { assetId?: string; dealId?: string }) {
  const router = useRouter();
  const fileInputId = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const form = useForm<DocumentUploadInput>({
    resolver: zodResolver(documentUploadSchema),
    defaultValues: {
      assetId,
      dealId
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => {
        if (value) body.append(key, String(value));
      });
      body.append('file', file);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Upload failed');
      }
      form.reset({ assetId, dealId });
      fileInput.value = '';
      setSuccess(`Document uploaded: ${values.title}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form className="space-y-5" onSubmit={onSubmit} data-testid="document-upload-form">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="fine-print">Asset ID</span>
          <Input {...form.register('assetId')} readOnly={Boolean(assetId)} />
        </label>
        {dealId ? (
          <label className="space-y-2">
            <span className="fine-print">Deal ID</span>
            <Input {...form.register('dealId')} readOnly />
          </label>
        ) : null}
        <label className="space-y-2">
          <span className="fine-print">Title</span>
          <Input placeholder="Power approval memo" data-testid="document-title" {...form.register('title')} />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Document Type</span>
          <Select {...form.register('documentType')}>
            {Object.values(DocumentType).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-2">
          <span className="fine-print">Source Link</span>
          <Input placeholder="https://..." {...form.register('sourceLink')} />
        </label>
        <label className="space-y-2 md:col-span-2">
          <span className="fine-print">File</span>
          <Input id={fileInputId} type="file" data-testid="document-file" />
        </label>
      </div>

      <label className="space-y-2">
        <span className="fine-print">Extracted Text / Notes</span>
        <Textarea
          className="min-h-[150px]"
          placeholder="Paste OCR text, analyst summary, or clauses worth preserving in the diligence trail."
          {...form.register('extractedText')}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-xl text-sm text-slate-400">
          Uploads are stored through the Next.js backend and immediately linked into document history, summaries, and future memo evidence.
        </p>
        <Button type="submit" disabled={submitting} data-testid="document-upload-submit">
          {submitting ? 'Uploading...' : 'Upload Document'}
        </Button>
      </div>
      {success ? (
        <div className="text-sm text-emerald-300" data-testid="document-upload-feedback" role="status">
          {success}
        </div>
      ) : null}
      {error ? (
        <div className="text-sm text-rose-300" data-testid="document-upload-feedback" role="alert">
          {error}
        </div>
      ) : null}
    </form>
  );
}
