'use client';

import { useState } from 'react';
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
  const form = useForm<InquiryInput>({
    resolver: zodResolver(inquirySchema),
    defaultValues: {
      requestType: 'Platform demo'
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const response = await fetch('/api/inquiries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(values)
    });

    if (response.ok) {
      setSubmitted(true);
      form.reset({
        requestType: 'Platform demo'
      });
    }
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
                    : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'
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

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4">
        <p className="max-w-xl text-sm text-slate-400">
          {submitted
            ? '문의가 접수되었습니다. The request is now stored in the institutional follow-up queue.'
            : '문의 내용은 Next.js backend에 저장되며 자산과 문서 워크플로우와 같은 운영 콘솔에서 관리됩니다.'}
        </p>
        <Button type="submit">플랫폼 문의 보내기</Button>
      </div>
    </form>
  );
}
