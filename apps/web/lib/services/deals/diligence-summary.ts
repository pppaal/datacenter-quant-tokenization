import {
  AssetClass,
  DealDiligenceWorkstreamStatus,
  DealDiligenceWorkstreamType
} from '@prisma/client';
import type { DealDetailRecord, DealListRecord } from '../deals';

export type DiligenceWorkstreamLike = {
  id: string;
  workstreamType: DealDiligenceWorkstreamType;
  status: DealDiligenceWorkstreamStatus;
  ownerLabel?: string | null;
  advisorName?: string | null;
  reportTitle?: string | null;
  requestedAt?: Date | null;
  dueDate?: Date | null;
  signedOffAt?: Date | null;
  signedOffByLabel?: string | null;
  summary?: string | null;
  blockerSummary?: string | null;
  notes?: string | null;
  deliverables?: Array<{
    id: string;
    note?: string | null;
    document: {
      id: string;
      title: string;
      documentType: string;
      currentVersion: number;
      documentHash: string;
      updatedAt: Date;
    };
  }>;
};

export type DealDiligenceSummary = {
  totalCount: number;
  signedOffCount: number;
  blockedCount: number;
  readyForSignoffCount: number;
  deliverableCount: number;
  uncoveredCoreTypes: DealDiligenceWorkstreamType[];
  coreRequiredTypes: DealDiligenceWorkstreamType[];
  missingCoreTypes: DealDiligenceWorkstreamType[];
  staleRequestedCount: number;
  headline: string;
};

const baseCoreDiligenceTypes: DealDiligenceWorkstreamType[] = [
  DealDiligenceWorkstreamType.LEGAL,
  DealDiligenceWorkstreamType.COMMERCIAL,
  DealDiligenceWorkstreamType.TECHNICAL
];

export function getCoreDiligenceTypes(assetClass: AssetClass | null | undefined) {
  const types = [...baseCoreDiligenceTypes];
  if (
    assetClass === AssetClass.DATA_CENTER ||
    assetClass === AssetClass.INDUSTRIAL ||
    assetClass === AssetClass.LAND
  ) {
    types.push(DealDiligenceWorkstreamType.ENVIRONMENTAL);
  }
  return types;
}

export function getDealDiligenceWorkstreams(deal: DealListRecord | DealDetailRecord) {
  return (
    'diligenceWorkstreams' in deal ? deal.diligenceWorkstreams : []
  ) as DiligenceWorkstreamLike[];
}

export function buildDealDiligenceSummary(
  deal: DealListRecord | DealDetailRecord,
  workstreams: DiligenceWorkstreamLike[] = getDealDiligenceWorkstreams(deal)
): DealDiligenceSummary {
  const coreRequiredTypes = getCoreDiligenceTypes(
    deal.assetClass ?? deal.asset?.assetClass ?? null
  );
  const signedOff = workstreams.filter(
    (item) => item.status === DealDiligenceWorkstreamStatus.SIGNED_OFF
  );
  const blocked = workstreams.filter(
    (item) => item.status === DealDiligenceWorkstreamStatus.BLOCKED
  );
  const readyForSignoff = workstreams.filter(
    (item) => item.status === DealDiligenceWorkstreamStatus.READY_FOR_SIGNOFF
  );
  const workstreamTypes = new Set(workstreams.map((item) => item.workstreamType));
  const missingCoreTypes = coreRequiredTypes.filter((item) => !workstreamTypes.has(item));
  const deliverableCount = workstreams.reduce(
    (total, item) => total + (item.deliverables?.length ?? 0),
    0
  );
  const uncoveredCoreTypes = coreRequiredTypes.filter((type) => {
    const lane = workstreams.find((item) => item.workstreamType === type);
    return !lane || (lane.deliverables?.length ?? 0) === 0;
  });
  const staleRequestedCount = workstreams.filter((item) => {
    if (!item.requestedAt || item.signedOffAt) return false;
    return Date.now() - item.requestedAt.getTime() > 1000 * 60 * 60 * 24 * 14;
  }).length;

  const headline =
    missingCoreTypes.length === 0 && blocked.length === 0
      ? signedOff.length >= coreRequiredTypes.length
        ? uncoveredCoreTypes.length === 0
          ? 'Core specialist diligence is signed off and committee-ready.'
          : 'Core specialist diligence is signed off, but supporting deliverables still need to be attached.'
        : 'Core diligence workstreams are open with no immediate specialist blockers.'
      : missingCoreTypes.length > 0
        ? `${missingCoreTypes.length} core diligence workstream${missingCoreTypes.length === 1 ? '' : 's'} still need to be opened.`
        : `${blocked.length} diligence workstream${blocked.length === 1 ? '' : 's'} are blocked and need intervention.`;

  return {
    totalCount: workstreams.length,
    signedOffCount: signedOff.length,
    blockedCount: blocked.length,
    readyForSignoffCount: readyForSignoff.length,
    deliverableCount,
    uncoveredCoreTypes,
    coreRequiredTypes,
    missingCoreTypes,
    staleRequestedCount,
    headline
  };
}
