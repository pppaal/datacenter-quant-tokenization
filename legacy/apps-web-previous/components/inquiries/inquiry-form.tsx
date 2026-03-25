'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { inquirySchema } from '@/lib/validations/asset';
import { z } from 'zod';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

type InquiryInput = z.infer<typeof inquirySchema>;

export function InquiryForm({ assetId }: { assetId?: string }) {
  const [status, setStatus] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<InquiryInput>({
    resolver: zodResolver(inquirySchema),
    defaultValues: { assetId }
  });

  const onSubmit = async (values: InquiryInput) => {
    const res = await fetch('/api/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    setStatus(res.ok ? '문의가 접수되었습니다.' : '문의 접수에 실패했습니다.');
    if (res.ok) reset({ assetId });
  };

  return (
    <Card>
      <h3 className="mb-2 font-semibold">Inquiry</h3>
      <p className="mb-4 text-xs text-slate-400">전문투자자/B2B 상담용 폼입니다.</p>
      <form className="grid gap-2" onSubmit={handleSubmit(onSubmit)}>
        <Input placeholder="담당자명" {...register('name')} />
        {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
        <Input placeholder="회사명" {...register('company')} />
        <Input placeholder="이메일" type="email" {...register('email')} />
        <Input placeholder="전화번호" {...register('phone')} />
        <Input placeholder="투자자 유형" {...register('investorType')} />
        <Input placeholder="검토 티켓 사이즈" {...register('ticketSize')} />
        <Textarea placeholder="문의 내용" {...register('message')} />
        <input type="hidden" {...register('assetId')} />
        <Button disabled={isSubmitting} type="submit">문의 제출</Button>
      </form>
      {status && <p className="mt-2 text-sm text-slate-300">{status}</p>}
    </Card>
  );
}
