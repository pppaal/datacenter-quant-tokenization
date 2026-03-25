'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { assetSchema } from '@/lib/validations/asset';
import { z } from 'zod';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

type AssetInput = z.infer<typeof assetSchema>;

const defaults: AssetInput = {
  name: '',
  slug: '',
  assetType: 'Data Center',
  country: 'KR',
  city: '',
  address: '',
  status: 'DRAFT',
  description: '',
  summary: '',
  powerCapacityMw: 1,
  landArea: 1,
  grossFloorArea: 1,
  tenantStatus: '',
  capex: 0,
  opex: 0,
  expectedIrr: 0,
  targetEquity: 0,
  debtStructure: '',
  riskNotes: '',
  isPublished: false,
  isSample: true
};

export function AssetForm({ mode, asset, assetId }: { mode: 'create' | 'edit'; asset?: Partial<AssetInput>; assetId?: string }) {
  const [msg, setMsg] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<AssetInput>({
    resolver: zodResolver(assetSchema),
    defaultValues: { ...defaults, ...asset }
  });

  const onSubmit = async (values: AssetInput) => {
    const url = mode === 'create' ? '/api/admin/assets' : `/api/admin/assets/${assetId}`;
    const method = mode === 'create' ? 'POST' : 'PATCH';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
    setMsg(res.ok ? '저장 완료' : '저장 실패');
  };

  return (
    <form className="grid gap-2" onSubmit={handleSubmit(onSubmit)}>
      <Input placeholder="name" {...register('name')} />
      <Input placeholder="slug" {...register('slug')} />
      <Input placeholder="assetType" {...register('assetType')} />
      <Input placeholder="country" {...register('country')} />
      <Input placeholder="city" {...register('city')} />
      <Input placeholder="address" {...register('address')} />
      <select className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" {...register('status')}>
        <option value="DRAFT">DRAFT</option>
        <option value="REVIEW">REVIEW</option>
        <option value="PUBLISHED">PUBLISHED</option>
      </select>
      <Textarea placeholder="description" {...register('description')} />
      <Textarea placeholder="summary" {...register('summary')} />
      <Input type="number" step="0.1" placeholder="powerCapacityMw" {...register('powerCapacityMw')} />
      <Input type="number" step="0.1" placeholder="landArea" {...register('landArea')} />
      <Input type="number" step="0.1" placeholder="grossFloorArea" {...register('grossFloorArea')} />
      <Input placeholder="tenantStatus" {...register('tenantStatus')} />
      <Input type="number" step="0.1" placeholder="capex" {...register('capex')} />
      <Input type="number" step="0.1" placeholder="opex" {...register('opex')} />
      <Input type="number" step="0.1" placeholder="expectedIrr" {...register('expectedIrr')} />
      <Input type="number" step="0.1" placeholder="targetEquity" {...register('targetEquity')} />
      <Input placeholder="debtStructure" {...register('debtStructure')} />
      <Textarea placeholder="riskNotes" {...register('riskNotes')} />
      <label className="text-sm"><input type="checkbox" {...register('isPublished')} /> published</label>
      <label className="text-sm"><input type="checkbox" {...register('isSample')} /> DEMO/SAMPLE</label>
      {Object.values(errors)[0] && <p className="text-xs text-red-400">입력값 검증 실패</p>}
      <Button disabled={isSubmitting}>저장</Button>
      {mode === 'edit' && (
        <Button
          type="button"
          className="bg-red-700"
          onClick={async () => {
            const r = await fetch(`/api/admin/assets/${assetId}`, { method: 'DELETE' });
            setMsg(r.ok ? '삭제 완료' : '삭제 실패');
          }}
        >
          삭제
        </Button>
      )}
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </form>
  );
}
