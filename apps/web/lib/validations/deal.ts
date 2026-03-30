import {
  ActivityType,
  AssetClass,
  DealBidStatus,
  DealLenderQuoteStatus,
  DealNegotiationEventType,
  DealStage,
  RiskSeverity,
  TaskPriority,
  TaskStatus
} from '@prisma/client';
import { z } from 'zod';

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

const optionalDateField = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  return value;
}, z.date().optional());

export const dealStageOrder = [
  DealStage.SOURCED,
  DealStage.SCREENED,
  DealStage.NDA,
  DealStage.LOI,
  DealStage.DD,
  DealStage.IC,
  DealStage.CLOSING,
  DealStage.ASSET_MANAGEMENT
] as const;

export const dealCreateSchema = z.object({
  title: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Deal title is required')),
  assetId: optionalStringField,
  stage: z.nativeEnum(DealStage).default(DealStage.SOURCED),
  market: optionalStringField,
  city: optionalStringField,
  country: optionalStringField,
  assetClass: z.nativeEnum(AssetClass).optional(),
  strategy: optionalStringField,
  headline: optionalStringField,
  nextAction: optionalStringField,
  nextActionAt: optionalDateField,
  targetCloseDate: optionalDateField,
  sellerGuidanceKrw: optionalNumberField,
  bidGuidanceKrw: optionalNumberField,
  purchasePriceKrw: optionalNumberField,
  statusLabel: optionalStringField,
  dealLead: optionalStringField
});

export const dealUpdateSchema = z.object({
  title: optionalStringField,
  stage: z.nativeEnum(DealStage).optional(),
  market: optionalStringField,
  city: optionalStringField,
  country: optionalStringField,
  assetClass: z.nativeEnum(AssetClass).nullable().optional(),
  strategy: optionalStringField,
  headline: optionalStringField,
  nextAction: optionalStringField,
  nextActionAt: optionalDateField,
  targetCloseDate: optionalDateField,
  sellerGuidanceKrw: optionalNumberField,
  bidGuidanceKrw: optionalNumberField,
  purchasePriceKrw: optionalNumberField,
  statusLabel: optionalStringField,
  closeOutcome: optionalStringField,
  closeSummary: optionalStringField,
  dealLead: optionalStringField
});

export const dealStageUpdateSchema = z.object({
  stage: z.nativeEnum(DealStage),
  note: optionalStringField
});

export const dealCounterpartySchema = z.object({
  name: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Name is required')),
  role: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Role is required')),
  shortName: optionalStringField,
  company: optionalStringField,
  email: z.preprocess(emptyStringToUndefined, z.string().trim().email().optional()),
  phone: optionalStringField,
  notes: optionalStringField
});

export const dealTaskCreateSchema = z.object({
  title: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Task title is required')),
  description: optionalStringField,
  status: z.nativeEnum(TaskStatus).default(TaskStatus.OPEN),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  ownerLabel: optionalStringField,
  dueDate: optionalDateField
});

export const dealTaskUpdateSchema = z.object({
  title: optionalStringField,
  description: optionalStringField,
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  ownerLabel: optionalStringField,
  dueDate: optionalDateField
});

export const dealDocumentRequestCreateSchema = z.object({
  title: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Request title is required')),
  category: optionalStringField,
  counterpartyId: optionalStringField,
  documentId: optionalStringField,
  status: z.enum(['REQUESTED', 'RECEIVED', 'WAIVED']).default('REQUESTED'),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  dueDate: optionalDateField,
  requestedAt: optionalDateField,
  receivedAt: optionalDateField,
  notes: optionalStringField
});

export const dealDocumentRequestUpdateSchema = z.object({
  title: optionalStringField,
  category: optionalStringField,
  counterpartyId: optionalStringField,
  documentId: optionalStringField,
  status: z.enum(['REQUESTED', 'RECEIVED', 'WAIVED']).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueDate: optionalDateField,
  requestedAt: optionalDateField,
  receivedAt: optionalDateField,
  notes: optionalStringField
});

export const dealBidRevisionCreateSchema = z.object({
  label: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Bid label is required')),
  counterpartyId: optionalStringField,
  status: z.nativeEnum(DealBidStatus).default(DealBidStatus.DRAFT),
  bidPriceKrw: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return value;
  }, z.number().positive('Bid price must be positive')),
  depositKrw: optionalNumberField,
  exclusivityDays: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  diligenceDays: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  closeTimelineDays: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  submittedAt: optionalDateField,
  notes: optionalStringField
});

export const dealBidRevisionUpdateSchema = z.object({
  label: optionalStringField,
  counterpartyId: optionalStringField,
  status: z.nativeEnum(DealBidStatus).optional(),
  bidPriceKrw: optionalNumberField,
  depositKrw: optionalNumberField,
  exclusivityDays: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  diligenceDays: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  closeTimelineDays: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  submittedAt: optionalDateField,
  notes: optionalStringField
});

export const dealLenderQuoteCreateSchema = z.object({
  facilityLabel: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Facility label is required')),
  counterpartyId: optionalStringField,
  status: z.nativeEnum(DealLenderQuoteStatus).default(DealLenderQuoteStatus.INDICATED),
  amountKrw: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return value;
  }, z.number().positive('Amount must be positive')),
  ltvPct: optionalNumberField,
  spreadBps: optionalNumberField,
  allInRatePct: optionalNumberField,
  dscrFloor: optionalNumberField,
  termMonths: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  ioMonths: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  quotedAt: optionalDateField,
  notes: optionalStringField
});

export const dealLenderQuoteUpdateSchema = z.object({
  facilityLabel: optionalStringField,
  counterpartyId: optionalStringField,
  status: z.nativeEnum(DealLenderQuoteStatus).optional(),
  amountKrw: optionalNumberField,
  ltvPct: optionalNumberField,
  spreadBps: optionalNumberField,
  allInRatePct: optionalNumberField,
  dscrFloor: optionalNumberField,
  termMonths: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  ioMonths: z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
    }
    return value;
  }, z.number().int().nonnegative().optional()),
  quotedAt: optionalDateField,
  notes: optionalStringField
});

export const dealNegotiationEventCreateSchema = z.object({
  counterpartyId: optionalStringField,
  bidRevisionId: optionalStringField,
  eventType: z.nativeEnum(DealNegotiationEventType),
  title: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Event title is required')),
  effectiveAt: optionalDateField,
  expiresAt: optionalDateField,
  summary: optionalStringField
});

export const dealNegotiationEventUpdateSchema = z.object({
  counterpartyId: optionalStringField,
  bidRevisionId: optionalStringField,
  eventType: z.nativeEnum(DealNegotiationEventType).optional(),
  title: optionalStringField,
  effectiveAt: optionalDateField,
  expiresAt: optionalDateField,
  summary: optionalStringField
});

export const dealRiskFlagSchema = z.object({
  title: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Risk title is required')),
  detail: optionalStringField,
  severity: z.nativeEnum(RiskSeverity).default(RiskSeverity.MEDIUM),
  statusLabel: optionalStringField
});

export const dealRiskFlagUpdateSchema = z.object({
  title: optionalStringField,
  detail: optionalStringField,
  severity: z.nativeEnum(RiskSeverity).optional(),
  statusLabel: optionalStringField,
  isResolved: z.boolean().optional()
});

export const dealActivitySchema = z.object({
  activityType: z.nativeEnum(ActivityType).default(ActivityType.NOTE),
  title: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Title is required')),
  body: optionalStringField,
  counterpartyId: optionalStringField
});

export const dealArchiveSchema = z.object({
  summary: optionalStringField
});

export const dealRestoreSchema = z.object({
  summary: optionalStringField
});

export const dealCloseOutSchema = z.object({
  outcome: z.enum(['CLOSED_WON', 'CLOSED_LOST']),
  summary: z.preprocess(emptyStringToUndefined, z.string().trim().min(1, 'Close-out summary is required'))
});

export type DealCreateInput = z.infer<typeof dealCreateSchema>;
export type DealUpdateInput = z.infer<typeof dealUpdateSchema>;
export type DealStageUpdateInput = z.infer<typeof dealStageUpdateSchema>;
export type DealCounterpartyInput = z.infer<typeof dealCounterpartySchema>;
export type DealTaskCreateInput = z.infer<typeof dealTaskCreateSchema>;
export type DealTaskUpdateInput = z.infer<typeof dealTaskUpdateSchema>;
export type DealDocumentRequestCreateInput = z.infer<typeof dealDocumentRequestCreateSchema>;
export type DealDocumentRequestUpdateInput = z.infer<typeof dealDocumentRequestUpdateSchema>;
export type DealBidRevisionCreateInput = z.infer<typeof dealBidRevisionCreateSchema>;
export type DealBidRevisionUpdateInput = z.infer<typeof dealBidRevisionUpdateSchema>;
export type DealLenderQuoteCreateInput = z.infer<typeof dealLenderQuoteCreateSchema>;
export type DealLenderQuoteUpdateInput = z.infer<typeof dealLenderQuoteUpdateSchema>;
export type DealNegotiationEventCreateInput = z.infer<typeof dealNegotiationEventCreateSchema>;
export type DealNegotiationEventUpdateInput = z.infer<typeof dealNegotiationEventUpdateSchema>;
export type DealRiskFlagInput = z.infer<typeof dealRiskFlagSchema>;
export type DealRiskFlagUpdateInput = z.infer<typeof dealRiskFlagUpdateSchema>;
export type DealActivityInput = z.infer<typeof dealActivitySchema>;
export type DealArchiveInput = z.infer<typeof dealArchiveSchema>;
export type DealRestoreInput = z.infer<typeof dealRestoreSchema>;
export type DealCloseOutInput = z.infer<typeof dealCloseOutSchema>;
