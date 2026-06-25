'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { inquirySchema, type InquiryInput } from '@/lib/validations/inquiry';

const requestTypes = [
  'Platform demo',
  'Workflow review',
  'Valuation sandbox',
  'Architecture walkthrough'
];

export function InquiryForm() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<InquiryInput>({
    resolver: zodResolver(inquirySchema),
    defaultValues: {
      requestType: 'Platform demo'
    }
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch('/api/inquiries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(values)
        });

        if (!response.ok) {
          setSubmitted(false);
          setError(
            '문의 전송에 실패했습니다. 잠시 후 다시 시도해 주세요. (Submission failed — please try again.)'
          );
          return;
        }

        setSubmitted(true);
        form.reset({
          requestType: 'Platform demo'
        });
      } catch {
        setSubmitted(false);
        setError(
          '네트워크 오류로 문의를 전송하지 못했습니다. (A network error prevented the request from being sent.)'
        );
      }
    });
  });

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="fine-print">Name</span>
          <Input placeholder="Infra lead" {...form.register('name')} />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Company</span>
          <Input placeholder="Institution / operator" {...form.register('company')} />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Email</span>
          <Input placeholder="team@example.com" type="email" {...form.register('email')} />
        </label>
        <label className="space-y-2">
          <span className="fine-print">Request Type</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {requestTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => form.setValue('requestType', type)}
                className={`rounded-2xl border px-3 py-3 text-left text-xs transition ${
                  form.watch('requestType') === type
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] text-[hsl(var(--muted))] hover:border-[hsl(var(--border-strong))] hover:text-[hsl(var(--foreground))]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </label>
      </div>

      <label className="space-y-2">
        <span className="fine-print">What are you evaluating?</span>
        <Textarea
          placeholder="Describe the asset-review workflow, diligence questions, or committee output you want to test."
          className="min-h-[160px]"
          {...form.register('message')}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[hsl(var(--border))] pt-4">
        <p
          className={
            error
              ? 'max-w-xl text-sm text-[hsl(var(--danger))]'
              : 'max-w-xl text-sm text-[hsl(var(--muted))]'
          }
          role={error ? 'alert' : undefined}
        >
          {error
            ? error
            : submitted
              ? '문의가 접수되었습니다. The request is now stored in the institutional follow-up queue.'
              : '문의 내용은 Next.js backend에 저장되며 자산과 문서 워크플로우와 같은 운영 콘솔에서 관리됩니다.'}
        </p>
        <Button type="submit" disabled={isPending} aria-busy={isPending}>
          {isPending ? '전송 중…' : '플랫폼 문의 보내기'}
        </Button>
      </div>
    </form>
  );
}
