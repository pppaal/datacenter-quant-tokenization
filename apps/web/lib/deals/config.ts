import { DealBidStatus, DealLenderQuoteStatus, DealNegotiationEventType, DealStage, RiskSeverity, TaskPriority, TaskStatus } from '@prisma/client';
import { toSentenceCase } from '@/lib/utils';

export const dealStageOptions = [
  DealStage.SOURCED,
  DealStage.SCREENED,
  DealStage.NDA,
  DealStage.LOI,
  DealStage.DD,
  DealStage.IC,
  DealStage.CLOSING,
  DealStage.ASSET_MANAGEMENT
] as const;

export const dealCounterpartyRoleOptions = ['BROKER', 'SELLER', 'OWNER', 'BUYER', 'LENDER', 'LAW_FIRM', 'ADVISOR'] as const;

export const taskStatusOptions = [
  TaskStatus.OPEN,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.DONE
] as const;

export const taskPriorityOptions = [
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
  TaskPriority.URGENT
] as const;

export const dealBidStatusOptions = [
  DealBidStatus.DRAFT,
  DealBidStatus.SUBMITTED,
  DealBidStatus.COUNTERED,
  DealBidStatus.BAFO,
  DealBidStatus.ACCEPTED,
  DealBidStatus.DECLINED,
  DealBidStatus.WITHDRAWN
] as const;

export const dealLenderQuoteStatusOptions = [
  'INDICATED',
  'TERM_SHEET',
  'CREDIT_APPROVED',
  'DECLINED',
  'WITHDRAWN',
  'CLOSED'
] as const satisfies readonly DealLenderQuoteStatus[];

export const dealNegotiationEventTypeOptions = [
  'SELLER_COUNTER',
  'BUYER_FEEDBACK',
  'EXCLUSIVITY_GRANTED',
  'EXCLUSIVITY_EXTENDED',
  'PROCESS_UPDATE'
] as const satisfies readonly DealNegotiationEventType[];

export const riskSeverityOptions = [
  RiskSeverity.LOW,
  RiskSeverity.MEDIUM,
  RiskSeverity.HIGH,
  RiskSeverity.CRITICAL
] as const;

export function formatDealStage(stage: DealStage) {
  return toSentenceCase(stage);
}

export function getDealStageTone(stage: DealStage) {
  switch (stage) {
    case DealStage.CLOSING:
    case DealStage.ASSET_MANAGEMENT:
      return 'good' as const;
    case DealStage.DD:
    case DealStage.IC:
      return 'warn' as const;
    default:
      return 'neutral' as const;
  }
}

export function getTaskStatusTone(status: TaskStatus) {
  switch (status) {
    case TaskStatus.DONE:
      return 'good' as const;
    case TaskStatus.BLOCKED:
      return 'danger' as const;
    case TaskStatus.IN_PROGRESS:
      return 'warn' as const;
    default:
      return 'neutral' as const;
  }
}

export function getRiskSeverityTone(severity: RiskSeverity, isResolved?: boolean) {
  if (isResolved) return 'good' as const;
  switch (severity) {
    case RiskSeverity.CRITICAL:
      return 'danger' as const;
    case RiskSeverity.HIGH:
      return 'warn' as const;
    default:
      return 'neutral' as const;
  }
}

export function getDealBidStatusTone(status: DealBidStatus) {
  switch (status) {
    case DealBidStatus.ACCEPTED:
      return 'good' as const;
    case DealBidStatus.COUNTERED:
    case DealBidStatus.BAFO:
      return 'warn' as const;
    case DealBidStatus.DECLINED:
    case DealBidStatus.WITHDRAWN:
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export function getDealLenderQuoteStatusTone(status: DealLenderQuoteStatus) {
  switch (status) {
    case DealLenderQuoteStatus.CREDIT_APPROVED:
    case DealLenderQuoteStatus.CLOSED:
      return 'good' as const;
    case DealLenderQuoteStatus.TERM_SHEET:
      return 'warn' as const;
    case DealLenderQuoteStatus.DECLINED:
    case DealLenderQuoteStatus.WITHDRAWN:
      return 'danger' as const;
    default:
      return 'neutral' as const;
  }
}

export function getDealNegotiationEventTone(eventType: DealNegotiationEventType) {
  switch (eventType) {
    case DealNegotiationEventType.SELLER_COUNTER:
    case DealNegotiationEventType.EXCLUSIVITY_GRANTED:
    case DealNegotiationEventType.EXCLUSIVITY_EXTENDED:
      return 'warn' as const;
    case DealNegotiationEventType.BUYER_FEEDBACK:
      return 'neutral' as const;
    default:
      return 'good' as const;
  }
}

export type DealChecklistTemplate = {
  key: string;
  title: string;
  description: string;
  kind: 'task' | 'field' | 'counterparty';
  fieldName?: 'nextAction' | 'sellerGuidanceKrw' | 'bidGuidanceKrw' | 'closeSummary';
  counterpartyRole?: string;
  defaultTaskTitle?: string;
  defaultTaskDescription?: string;
  priority?: TaskPriority;
};

export const dealStageChecklistTemplates: Record<DealStage, DealChecklistTemplate[]> = {
  [DealStage.SOURCED]: [
    {
      key: 'source-broker-contact',
      title: 'Broker or seller contact logged',
      description: 'A real contact exists before spending time on the file.',
      kind: 'counterparty',
      counterpartyRole: 'BROKER'
    },
    {
      key: 'source-initial-triage',
      title: 'Initial triage completed',
      description: 'Write down the first commercial read and whether the process is worth screening.',
      kind: 'task',
      defaultTaskTitle: 'Complete sourced-opportunity triage',
      defaultTaskDescription: 'Review teaser, seller setup, and immediate reasons to pass or continue.',
      priority: TaskPriority.HIGH
    },
    {
      key: 'source-next-action',
      title: 'Next action set',
      description: 'The very next call, request, or decision is visible.',
      kind: 'field',
      fieldName: 'nextAction'
    }
  ],
  [DealStage.SCREENED]: [
    {
      key: 'screen-pricing-range',
      title: 'Initial pricing range captured',
      description: 'Capture seller guidance or your first bid view before pushing deeper.',
      kind: 'field',
      fieldName: 'sellerGuidanceKrw'
    },
    {
      key: 'screen-go-no-go',
      title: 'Go / no-go screen memo',
      description: 'Record the screen result and key commercial gating points.',
      kind: 'task',
      defaultTaskTitle: 'Write screen memo and go/no-go recommendation',
      defaultTaskDescription: 'Summarize the first pass view, blockers, and reasons to continue.',
      priority: TaskPriority.HIGH
    }
  ],
  [DealStage.NDA]: [
    {
      key: 'nda-execution',
      title: 'NDA executed',
      description: 'Legal access to diligence materials is in place.',
      kind: 'task',
      defaultTaskTitle: 'Get NDA signed and countersigned',
      defaultTaskDescription: 'Push NDA, confirm signatures, and unlock diligence materials.',
      priority: TaskPriority.URGENT
    },
    {
      key: 'nda-seller-contact',
      title: 'Seller contact logged',
      description: 'A real seller-side contact exists for diligence requests.',
      kind: 'counterparty',
      counterpartyRole: 'SELLER'
    }
  ],
  [DealStage.LOI]: [
    {
      key: 'loi-draft',
      title: 'LOI drafted and circulated',
      description: 'Commercial terms are written and ready for submission.',
      kind: 'task',
      defaultTaskTitle: 'Draft and circulate LOI',
      defaultTaskDescription: 'Set price, certainty, timing, diligence scope, and key assumptions.',
      priority: TaskPriority.URGENT
    },
    {
      key: 'loi-bid',
      title: 'Bid view captured',
      description: 'Your executable bid view is on the record.',
      kind: 'field',
      fieldName: 'bidGuidanceKrw'
    }
  ],
  [DealStage.DD]: [
    {
      key: 'dd-legal',
      title: 'Legal diligence workstream open',
      description: 'Core legal DD has an owner and a deadline.',
      kind: 'task',
      defaultTaskTitle: 'Open legal diligence workstream',
      defaultTaskDescription: 'Engage counsel, identify key title/contract blockers, and track answers.',
      priority: TaskPriority.HIGH
    },
    {
      key: 'dd-commercial',
      title: 'Commercial diligence workstream open',
      description: 'Underwrite operations, leases, counterparties, and downside cases.',
      kind: 'task',
      defaultTaskTitle: 'Run commercial and underwriting diligence',
      defaultTaskDescription: 'Confirm underwriting assumptions, key contracts, and downside cases.',
      priority: TaskPriority.HIGH
    }
  ],
  [DealStage.IC]: [
    {
      key: 'ic-pack',
      title: 'IC package completed',
      description: 'Recommendation is packaged for decision makers.',
      kind: 'task',
      defaultTaskTitle: 'Finalize IC package',
      defaultTaskDescription: 'Prepare recommendation, downside, and approval asks.',
      priority: TaskPriority.URGENT
    },
    {
      key: 'ic-questions',
      title: 'IC questions tracker open',
      description: 'Decision-maker questions have a visible owner and answer path.',
      kind: 'task',
      defaultTaskTitle: 'Track IC questions and approvals',
      defaultTaskDescription: 'Capture follow-ups from IC and push them to resolution.',
      priority: TaskPriority.HIGH
    }
  ],
  [DealStage.CLOSING]: [
    {
      key: 'closing-docs',
      title: 'Signing and closing documents tracked',
      description: 'SPA, schedules, CPs, and funds flow are actively tracked.',
      kind: 'task',
      defaultTaskTitle: 'Track signing docs and closing conditions',
      defaultTaskDescription: 'Manage document execution, CP list, and funds flow readiness.',
      priority: TaskPriority.URGENT
    },
    {
      key: 'closing-buyer-contact',
      title: 'Buyer / internal execution contact logged',
      description: 'Execution owner and counterpart on the buy side are visible.',
      kind: 'counterparty',
      counterpartyRole: 'BUYER'
    }
  ],
  [DealStage.ASSET_MANAGEMENT]: [
    {
      key: 'handoff-plan',
      title: 'Asset management handoff plan',
      description: 'The first 30-day operating plan is documented.',
      kind: 'task',
      defaultTaskTitle: 'Prepare asset management handoff',
      defaultTaskDescription: 'Document first 30-day priorities, reporting cadence, and unresolved issues.',
      priority: TaskPriority.MEDIUM
    },
    {
      key: 'close-summary',
      title: 'Close-out summary logged',
      description: 'A final summary exists for what closed and what carries forward.',
      kind: 'field',
      fieldName: 'closeSummary'
    }
  ]
};
