import { getAssetClassPlaybook, type ResearchDisciplineKey } from '@/lib/asset-class/playbook';
import type { AssetEvidenceReviewSummary } from '@/lib/services/review';

type MicroResearchAsset = {
  assetClass: any;
  address?: {
    parcelId?: string | null;
    city?: string | null;
    province?: string | null;
  } | null;
  buildingSnapshot?: {
    zoning?: string | null;
    structureDescription?: string | null;
  } | null;
  siteProfile?: {
    siteNotes?: string | null;
  } | null;
  ownershipRecords?: Array<{ id: string }>;
  encumbranceRecords?: Array<{ id: string }>;
  planningConstraints?: Array<{ id: string }>;
  leases?: Array<{ id: string }>;
  debtFacilities?: Array<{ id: string }>;
  taxAssumption?: { id: string } | null;
  documents?: Array<{ id: string }>;
};

export type MicroResearchSummary = {
  approvedCoverageCount: number;
  pendingBlockers: string[];
  scorecards: Array<{
    key: ResearchDisciplineKey;
    label: string;
    status: 'good' | 'partial' | 'open';
    detail: string;
  }>;
};

function toStatus(ready: boolean, partial: boolean): 'good' | 'partial' | 'open' {
  if (ready) return 'good';
  if (partial) return 'partial';
  return 'open';
}

export function buildMicroResearchSummary(
  asset: MicroResearchAsset,
  reviewSummary: AssetEvidenceReviewSummary
): MicroResearchSummary {
  const playbook = getAssetClassPlaybook(asset.assetClass);
  const scorecards = [
    {
      key: 'location_parcel' as const,
      label: playbook.researchDisciplineLabels.location_parcel,
      status: toStatus(Boolean(asset.address?.city), Boolean(asset.address?.parcelId)),
      detail: asset.address?.parcelId
        ? `Parcel ${asset.address.parcelId} is attached to the dossier.`
        : `Address context is ${asset.address?.city ?? 'not yet'} normalized; parcel linkage still needs confirmation.`
    },
    {
      key: 'zoning_permit_entitlement' as const,
      label: playbook.researchDisciplineLabels.zoning_permit_entitlement,
      status: toStatus(
        (reviewSummary.disciplines.find((item) => item.key === 'power_permit')?.approvedCount ?? 0) > 0,
        (reviewSummary.disciplines.find((item) => item.key === 'power_permit')?.pendingCount ?? 0) > 0
      ),
      detail:
        reviewSummary.disciplines.find((item) => item.key === 'power_permit')?.items[0]?.detail ??
        'No permit or entitlement evidence is normalized yet.'
    },
    {
      key: 'building_physical' as const,
      label: playbook.researchDisciplineLabels.building_physical,
      status: toStatus(Boolean(asset.buildingSnapshot?.structureDescription), Boolean(asset.siteProfile?.siteNotes)),
      detail:
        asset.buildingSnapshot?.structureDescription ??
        asset.siteProfile?.siteNotes ??
        'No physical inspection or building profile detail has been normalized yet.'
    },
    {
      key: 'ownership_encumbrance_planning' as const,
      label: playbook.researchDisciplineLabels.ownership_encumbrance_planning,
      status: toStatus(
        (reviewSummary.disciplines.find((item) => item.key === 'legal_title')?.approvedCount ?? 0) > 0,
        (reviewSummary.disciplines.find((item) => item.key === 'legal_title')?.pendingCount ?? 0) > 0
      ),
      detail:
        reviewSummary.disciplines.find((item) => item.key === 'legal_title')?.items[0]?.detail ??
        'No ownership, encumbrance, or planning evidence has been reviewed yet.'
    },
    {
      key: 'lease_revenue' as const,
      label: playbook.researchDisciplineLabels.lease_revenue,
      status: toStatus(
        (reviewSummary.disciplines.find((item) => item.key === 'lease_revenue')?.approvedCount ?? 0) > 0,
        (reviewSummary.disciplines.find((item) => item.key === 'lease_revenue')?.pendingCount ?? 0) > 0
      ),
      detail:
        reviewSummary.disciplines.find((item) => item.key === 'lease_revenue')?.items[0]?.detail ??
        'No approved lease or revenue evidence is available yet.'
    },
    {
      key: 'tax_debt_structure' as const,
      label: playbook.researchDisciplineLabels.tax_debt_structure,
      status: toStatus(Boolean(asset.taxAssumption || (asset.debtFacilities?.length ?? 0) > 0), Boolean(asset.debtFacilities?.length)),
      detail:
        asset.debtFacilities && asset.debtFacilities.length > 0
          ? `${asset.debtFacilities.length} debt facility row(s) support the current structure view.`
          : 'No financing or tax structure detail is attached to the dossier yet.'
    },
    {
      key: 'document_coverage' as const,
      label: playbook.researchDisciplineLabels.document_coverage,
      status: toStatus((asset.documents?.length ?? 0) >= 3, (asset.documents?.length ?? 0) > 0),
      detail:
        (asset.documents?.length ?? 0) > 0
          ? `${asset.documents?.length ?? 0} document(s) are currently linked to the asset dossier.`
          : 'No documents are in the room yet.'
    }
  ];

  return {
    approvedCoverageCount: reviewSummary.approvedCoverageCount,
    pendingBlockers: reviewSummary.pendingBlockers,
    scorecards
  };
}
