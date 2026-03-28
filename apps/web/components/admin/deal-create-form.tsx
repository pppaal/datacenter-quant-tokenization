'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { AssetClass, DealStage } from '@prisma/client';
import { useForm } from 'react-hook-form';
import { dealStageOptions, formatDealStage } from '@/lib/deals/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { dealCreateSchema, type DealCreateInput } from '@/lib/validations/deal';

type AssetOption = {
  id: string;
  name: string;
  assetCode: string;
  assetClass: AssetClass;
  market: string;
  city: string | null;
  country: string | null;
};

type Props = {
  assets: AssetOption[];
};

const numericFields = new Set<keyof DealCreateInput>([
  'sellerGuidanceKrw',
  'bidGuidanceKrw',
  'purchasePriceKrw'
]);

export function DealCreateForm({ assets }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<DealCreateInput>({
    resolver: zodResolver(dealCreateSchema),
    defaultValues: {
      title: '',
      stage: DealStage.SOURCED,
      market: 'KR',
      country: 'KR',
      dealLead: 'solo_operator',
      statusLabel: 'ACTIVE'
    }
  });

  const selectedAssetId = form.watch('assetId');
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId);

  async function onSubmit(values: DealCreateInput) {
    setSubmitting(true);
    try {
      const response = await fetch('/api/deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });

      if (!response.ok) {
        throw new Error('Failed to create deal');
      }

      const deal = await response.json();
      router.push(`/admin/deals/${deal.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <div className="eyebrow">New Deal</div>
        <h2 className="mt-3 text-2xl font-semibold text-white">Open a live execution record</h2>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          Start from a teaser, link an existing asset if one already exists, and keep the next action visible from day
          one.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="fine-print">Deal Title</span>
          <Input placeholder="Distressed core office recap in Seoul CBD" {...form.register('title')} />
        </label>

        <label className="space-y-2">
          <span className="fine-print">Linked Asset</span>
          <Select {...form.register('assetId')}>
            <option value="">Standalone sourced opportunity</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.assetCode} / {asset.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-2">
          <span className="fine-print">Pipeline Stage</span>
          <Select {...form.register('stage')}>
            {dealStageOptions.map((stage) => (
              <option key={stage} value={stage}>
                {formatDealStage(stage)}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-2">
          <span className="fine-print">Market</span>
          <Input placeholder="KR" {...form.register('market')} />
        </label>

        <label className="space-y-2">
          <span className="fine-print">Country</span>
          <Input placeholder="KR" {...form.register('country')} />
        </label>

        <label className="space-y-2">
          <span className="fine-print">City</span>
          <Input placeholder="Seoul" {...form.register('city')} />
        </label>

        <label className="space-y-2">
          <span className="fine-print">Asset Class</span>
          <Select {...form.register('assetClass')}>
            <option value="">Use linked asset or set later</option>
            {Object.values(AssetClass).map((assetClass) => (
              <option key={assetClass} value={assetClass}>
                {assetClass.replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="fine-print">Headline</span>
          <Input
            placeholder="Recapitalization with court-driven process, single-bank seller, and short diligence window."
            {...form.register('headline')}
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <span className="fine-print">Next Action</span>
          <Textarea
            className="min-h-[120px]"
            placeholder="Book broker call, request NDA, and confirm borrower default timeline."
            {...form.register('nextAction')}
          />
        </label>

        <label className="space-y-2">
          <span className="fine-print">Target Close Date</span>
          <Input type="date" {...form.register('targetCloseDate', { valueAsDate: true })} />
        </label>

        <label className="space-y-2">
          <span className="fine-print">Deal Lead</span>
          <Input placeholder="solo_operator" {...form.register('dealLead')} />
        </label>

        {(['sellerGuidanceKrw', 'bidGuidanceKrw', 'purchasePriceKrw'] as const).map((field) => (
          <label key={field} className="space-y-2">
            <span className="fine-print">
              {field === 'sellerGuidanceKrw'
                ? 'Seller Guidance (KRW)'
                : field === 'bidGuidanceKrw'
                  ? 'Bid Guidance (KRW)'
                  : 'Purchase Price (KRW)'}
            </span>
            <Input type="number" step="any" {...form.register(field, { valueAsNumber: numericFields.has(field) })} />
          </label>
        ))}
      </div>

      {selectedAsset ? (
        <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300">
          <div className="fine-print">Linked Asset Context</div>
          <div className="mt-3 text-white">
            {selectedAsset.assetCode} / {selectedAsset.name}
          </div>
          <div className="mt-2 text-slate-400">
            {selectedAsset.assetClass.replaceAll('_', ' ')} / {selectedAsset.city ?? selectedAsset.market} /{' '}
            {selectedAsset.country ?? 'N/A'}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-5">
        <p className="max-w-2xl text-sm text-slate-400">
          This creates the execution record only. Detailed diligence tasks, counterparties, notes, and risks are added
          on the deal page.
        </p>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Opening...' : 'Open Deal'}
        </Button>
      </div>
    </form>
  );
}
