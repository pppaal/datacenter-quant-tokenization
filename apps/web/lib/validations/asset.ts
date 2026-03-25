import { AssetClass, AssetStage, AssetStatus, ReadinessStatus, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { convertToKrw, resolveInputCurrency, supportedCurrencies } from '@/lib/finance/currency';
import { slugify } from '@/lib/utils';

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const optionalStringField = z.preprocess(emptyStringToUndefined, z.string().trim().optional());

const optionalNumberField = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return value;
}, z.number().optional());

const assetIntakeBaseSchema = z.object({
  assetClass: z.nativeEnum(AssetClass).default(AssetClass.DATA_CENTER),
  assetCode: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Asset code is required')),
  name: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Asset name is required')),
  assetType: optionalStringField,
  assetSubtype: optionalStringField,
  status: z.nativeEnum(AssetStatus).default(AssetStatus.INTAKE),
  stage: z.nativeEnum(AssetStage).default(AssetStage.SCREENING),
  description: z.preprocess((value) => (typeof value === 'string' ? value.trim() : ''), z.string()),
  ownerName: optionalStringField,
  sponsorName: optionalStringField,
  developmentSummary: optionalStringField,
  targetItLoadMw: optionalNumberField,
  powerCapacityMw: optionalNumberField,
  landAreaSqm: optionalNumberField,
  grossFloorAreaSqm: optionalNumberField,
  rentableAreaSqm: optionalNumberField,
  purchasePriceKrw: optionalNumberField,
  stabilizedRentPerSqmMonthKrw: optionalNumberField,
  otherIncomeKrw: optionalNumberField,
  vacancyAllowancePct: optionalNumberField,
  creditLossPct: optionalNumberField,
  tenantImprovementReserveKrw: optionalNumberField,
  leasingCommissionReserveKrw: optionalNumberField,
  annualCapexReserveKrw: optionalNumberField,
  weightedAverageLeaseTermYears: optionalNumberField,
  occupancyAssumptionPct: optionalNumberField,
  stabilizedOccupancyPct: optionalNumberField,
  tenantAssumption: optionalStringField,
  capexAssumptionKrw: optionalNumberField,
  opexAssumptionKrw: optionalNumberField,
  financingLtvPct: optionalNumberField,
  financingRatePct: optionalNumberField,
  holdingPeriodYears: optionalNumberField,
  exitCapRatePct: optionalNumberField,
  line1: optionalStringField,
  line2: optionalStringField,
  district: optionalStringField,
  city: optionalStringField,
  province: optionalStringField,
  postalCode: optionalStringField,
  country: optionalStringField,
  inputCurrency: z.enum(supportedCurrencies).optional(),
  parcelId: optionalStringField,
  latitude: optionalNumberField,
  longitude: optionalNumberField,
  siteNotes: optionalStringField
});

export const assetIntakeSchema = assetIntakeBaseSchema.superRefine((value, ctx) => {
  if (
    value.assetClass === AssetClass.DATA_CENTER &&
    value.powerCapacityMw === undefined &&
    value.targetItLoadMw === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['powerCapacityMw'],
      message: 'Enter power capacity or target IT load for data-center assets'
    });
  }

  if (
    (
      value.assetClass === AssetClass.OFFICE ||
      value.assetClass === AssetClass.INDUSTRIAL ||
      value.assetClass === AssetClass.RETAIL ||
      value.assetClass === AssetClass.MULTIFAMILY
    ) &&
    value.rentableAreaSqm === undefined &&
    value.grossFloorAreaSqm === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rentableAreaSqm'],
      message: 'Enter rentable area or gross floor area for income-producing assets'
    });
  }
});

export const assetIntakeUpdateSchema = assetIntakeBaseSchema.partial();

export type AssetIntakeInput = z.infer<typeof assetIntakeSchema>;
export type AssetIntakeUpdateInput = z.infer<typeof assetIntakeUpdateSchema>;

const moneyFields = [
  'purchasePriceKrw',
  'stabilizedRentPerSqmMonthKrw',
  'otherIncomeKrw',
  'tenantImprovementReserveKrw',
  'leasingCommissionReserveKrw',
  'annualCapexReserveKrw',
  'capexAssumptionKrw',
  'opexAssumptionKrw'
] as const;

function normalizeMoneyFieldsToKrw<T extends AssetIntakeInput | AssetIntakeUpdateInput>(input: T) {
  const currency = resolveInputCurrency(input.country, input.inputCurrency);
  const normalized = { ...input } as T;

  for (const field of moneyFields) {
    const value = input[field];
    if (typeof value === 'number') {
      (normalized as Record<string, unknown>)[field] = convertToKrw(value, currency);
    }
  }

  return normalized;
}

function getDefaultAssetType(assetClass: AssetClass) {
  switch (assetClass) {
    case AssetClass.OFFICE:
      return 'Office';
    case AssetClass.INDUSTRIAL:
      return 'Industrial';
    case AssetClass.RETAIL:
      return 'Retail';
    case AssetClass.MULTIFAMILY:
      return 'Multifamily';
    case AssetClass.HOTEL:
      return 'Hotel';
    case AssetClass.DATA_CENTER:
      return 'Data Center';
    case AssetClass.LAND:
      return 'Land';
    case AssetClass.MIXED_USE:
      return 'Mixed Use';
    default:
      return 'Real Estate';
  }
}

function buildAddressCreate(input: AssetIntakeInput) {
  const hasAddress =
    input.line1 ||
    input.line2 ||
    input.district ||
    input.city ||
    input.province ||
    input.postalCode ||
    input.latitude !== undefined ||
    input.longitude !== undefined ||
    input.parcelId;

  if (!hasAddress) return undefined;

  return {
    create: {
      line1: input.line1 ?? input.name,
      line2: input.line2,
      district: input.district,
      city: input.city ?? 'Seoul',
      province: input.province ?? input.city ?? 'Seoul',
      postalCode: input.postalCode,
      country: input.country ?? 'KR',
      latitude: input.latitude,
      longitude: input.longitude,
      parcelId: input.parcelId,
      sourceLabel: 'manual intake'
    }
  } satisfies Prisma.AddressCreateNestedOneWithoutAssetInput;
}

function getDefaultSiteProfileCopy(assetClass: AssetClass) {
  if (assetClass === AssetClass.DATA_CENTER) {
    return {
      fiberAccess: 'Pending enrichment',
      latencyProfile: 'Initial intake'
    };
  }

  return {
    fiberAccess: 'General connectivity review pending',
    latencyProfile: 'Standard site access review'
  };
}

export function buildAssetCreateInput(
  input: AssetIntakeInput,
  options?: {
    normalizeMoney?: boolean;
  }
): Prisma.AssetCreateInput {
  const normalizedInput = options?.normalizeMoney === false ? input : normalizeMoneyFieldsToKrw(input);
  const assetCode = normalizedInput.assetCode.trim().toUpperCase();
  const assetName = normalizedInput.name.trim();
  const assetType = normalizedInput.assetType ?? getDefaultAssetType(normalizedInput.assetClass);
  const defaultSiteProfile = getDefaultSiteProfileCopy(normalizedInput.assetClass);

  return {
    assetCode,
    slug: slugify(`${assetCode} ${assetName}`),
    name: assetName,
    assetClass: normalizedInput.assetClass,
    assetType,
    assetSubtype: normalizedInput.assetSubtype,
    market: normalizedInput.country ?? 'KR',
    status: normalizedInput.status,
    stage: normalizedInput.stage,
    description: normalizedInput.description,
    ownerName: normalizedInput.ownerName,
    sponsorName: normalizedInput.sponsorName,
    developmentSummary: normalizedInput.developmentSummary,
    targetItLoadMw: normalizedInput.targetItLoadMw,
    powerCapacityMw: normalizedInput.powerCapacityMw,
    landAreaSqm: normalizedInput.landAreaSqm,
    grossFloorAreaSqm: normalizedInput.grossFloorAreaSqm,
    rentableAreaSqm: normalizedInput.rentableAreaSqm,
    purchasePriceKrw: normalizedInput.purchasePriceKrw,
    occupancyAssumptionPct: normalizedInput.occupancyAssumptionPct,
    stabilizedOccupancyPct: normalizedInput.stabilizedOccupancyPct,
    tenantAssumption: normalizedInput.tenantAssumption,
    capexAssumptionKrw: normalizedInput.capexAssumptionKrw,
    opexAssumptionKrw: normalizedInput.opexAssumptionKrw,
    financingLtvPct: normalizedInput.financingLtvPct,
    financingRatePct: normalizedInput.financingRatePct,
    holdingPeriodYears: normalizedInput.holdingPeriodYears,
    exitCapRatePct: normalizedInput.exitCapRatePct,
    address: buildAddressCreate(normalizedInput),
    siteProfile: {
      create: {
        gridAvailability: 'Pending enrichment',
        fiberAccess: defaultSiteProfile.fiberAccess,
        latencyProfile: defaultSiteProfile.latencyProfile,
        siteNotes: normalizedInput.siteNotes ?? 'Initial intake record'
      }
    },
    dataCenterDetail:
      normalizedInput.assetClass === AssetClass.DATA_CENTER
        ? {
            create: {
              powerCapacityMw: normalizedInput.powerCapacityMw,
              targetItLoadMw: normalizedInput.targetItLoadMw,
              fiberAccess: 'Pending enrichment',
              latencyProfile: 'Initial intake'
            }
          }
        : undefined,
    officeDetail:
      normalizedInput.assetClass === AssetClass.OFFICE
        ? {
            create: {
              stabilizedRentPerSqmMonthKrw: normalizedInput.stabilizedRentPerSqmMonthKrw,
              otherIncomeKrw: normalizedInput.otherIncomeKrw,
              vacancyAllowancePct: normalizedInput.vacancyAllowancePct,
              creditLossPct: normalizedInput.creditLossPct,
              tenantImprovementReserveKrw: normalizedInput.tenantImprovementReserveKrw,
              leasingCommissionReserveKrw: normalizedInput.leasingCommissionReserveKrw,
              annualCapexReserveKrw: normalizedInput.annualCapexReserveKrw,
              weightedAverageLeaseTermYears: normalizedInput.weightedAverageLeaseTermYears
            }
          }
        : undefined,
    readinessProject: {
      create: {
        readinessStatus: ReadinessStatus.NOT_STARTED,
        packageName: `${assetName} Review Package`,
        reviewPhase: 'Committee review',
        legalStructure: 'SPV pending counsel review',
        nextAction: 'Upload diligence pack and refresh valuation analysis'
      }
    }
  };
}
