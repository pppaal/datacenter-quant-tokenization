import { DealStage, TaskStatus } from '@prisma/client';
import { dealStageChecklistTemplates } from '@/lib/deals/config';
import { dealStageOrder } from '@/lib/validations/deal';
import type { DealDetailRecord } from '../deals';

/**
 * Stage metadata used by the deal pipeline UI. Built once per module load
 * from the canonical `dealStageOrder` validator output.
 */
export const dealStageMeta = dealStageOrder.map((stage) => ({
  value: stage,
  label: stage.toLowerCase().replaceAll('_', ' ')
}));

export function getStageIndex(stage: DealStage) {
  return dealStageOrder.indexOf(stage);
}

export function getChecklistTemplates(stage: DealStage) {
  return dealStageChecklistTemplates[stage] ?? [];
}

export function getChecklistTaskKey(stage: DealStage, key: string) {
  return `${stage.toLowerCase()}::${key}`;
}

export function buildDealStageSummary(stage: DealStage) {
  const index = getStageIndex(stage);
  return dealStageMeta.map((item, itemIndex) => ({
    ...item,
    isCurrent: item.value === stage,
    isCompleted: itemIndex < index,
    isUpcoming: itemIndex > index
  }));
}

export function buildDealStageChecklist(deal: DealDetailRecord) {
  return getChecklistTemplates(deal.stage).map((template) => {
    if (template.kind === 'task') {
      const checklistKey = getChecklistTaskKey(deal.stage, template.key);
      const task = deal.tasks.find((item) => item.checklistKey === checklistKey);
      return {
        ...template,
        status: task ? (task.status === TaskStatus.DONE ? 'done' : 'open') : 'missing',
        taskId: task?.id ?? null
      };
    }

    if (template.kind === 'field') {
      const value = template.fieldName ? deal[template.fieldName] : null;
      return {
        ...template,
        status: value ? 'done' : 'missing',
        taskId: null
      };
    }

    const counterpartyExists = template.counterpartyRole
      ? deal.counterparties.some((counterparty) => counterparty.role === template.counterpartyRole)
      : false;
    return {
      ...template,
      status: counterpartyExists ? 'done' : 'missing',
      taskId: null
    };
  });
}
