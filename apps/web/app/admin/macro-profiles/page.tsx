import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  MacroProfileOverrideForm,
  type MacroProfileOverrideView
} from '@/components/admin/macro-profile-override-form';
import { listMacroProfileOverrides } from '@/lib/services/macro/profile-overrides';

export const dynamic = 'force-dynamic';

export default async function MacroProfilesPage() {
  const overrides = await listMacroProfileOverrides();
  const rows: MacroProfileOverrideView[] = overrides.map((override) => ({
    id: override.id,
    assetClass: override.assetClass,
    country: override.country,
    submarketPattern: override.submarketPattern,
    label: override.label,
    capitalRateMultiplier: override.capitalRateMultiplier,
    liquidityMultiplier: override.liquidityMultiplier,
    leasingMultiplier: override.leasingMultiplier,
    constructionMultiplier: override.constructionMultiplier,
    priority: override.priority,
    isActive: override.isActive,
    notes: override.notes,
    createdAt: override.createdAt.toISOString(),
    updatedAt: override.updatedAt.toISOString()
  }));
  const activeCount = rows.filter((row) => row.isActive).length;
  const scopedSubmarkets = rows.filter((row) => row.submarketPattern).length;

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Macro Profile Registry</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Operational override layer for regime transmission
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          Static templates still define the base asset-class beta. This registry lets operators
          adjust country and submarket transmission without changing code, so valuation and quant
          views stay in sync while market nuance moves.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="fine-print">Active Overrides</div>
          <div className="mt-3 text-2xl font-semibold text-white">{activeCount}</div>
          <p className="mt-2 text-sm text-slate-400">
            Merged into the regime engine on every valuation run.
          </p>
        </Card>
        <Card>
          <div className="fine-print">Submarket Regex Rules</div>
          <div className="mt-3 text-2xl font-semibold text-white">{scopedSubmarkets}</div>
          <p className="mt-2 text-sm text-slate-400">
            Highest precision layer for city, corridor, or cluster-specific beta shifts.
          </p>
        </Card>
        <Card>
          <div className="fine-print">Evaluation Order</div>
          <div className="mt-3 text-2xl font-semibold text-white">Static → Country → Submarket</div>
          <p className="mt-2 text-sm text-slate-400">
            Lower priority numbers apply first, then later rules compound on top.
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge>valuation runtime</Badge>
        <Badge>quant allocation</Badge>
        <Badge>country overrides</Badge>
        <Badge>regex submarkets</Badge>
      </div>

      <MacroProfileOverrideForm initialOverrides={rows} />
    </div>
  );
}
