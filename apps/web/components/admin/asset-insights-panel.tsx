import type { AiInsight, PipelineProject } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDate, formatNumber, toSentenceCase } from '@/lib/utils';

type Props = {
  aiInsights: AiInsight[];
  pipelineProjects: PipelineProject[];
};

export function AssetInsightsPanel({ aiInsights, pipelineProjects }: Props) {
  if (aiInsights.length === 0 && pipelineProjects.length === 0) return null;

  return (
    <Card data-testid="asset-insights-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">AI Insights &amp; Supply Pipeline</div>
          <h3 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            Model-generated signals and competing supply
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[hsl(var(--muted))]">
            AI-surfaced risks and market signals alongside competing development pipeline that could
            pressure stabilized rents at exit.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {aiInsights.length > 0 ? (
          <div className="space-y-3">
            <div className="fine-print">AI Insights</div>
            {aiInsights.map((insight) => (
              <div
                key={insight.id}
                className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {insight.title ?? toSentenceCase(insight.insightType)}
                  </div>
                  <Badge tone="neutral">{insight.modelName}</Badge>
                </div>
                <p className="mt-2 text-xs leading-6 text-[hsl(var(--muted))]">{insight.content}</p>
              </div>
            ))}
          </div>
        ) : null}

        {pipelineProjects.length > 0 ? (
          <div className="space-y-3">
            <div className="fine-print">Competitive Supply Pipeline</div>
            {pipelineProjects.map((project) => (
              <div
                key={project.id}
                className="rounded-[20px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {project.projectName}
                  </div>
                  {project.stageLabel ? (
                    <Badge tone="neutral">{toSentenceCase(project.stageLabel)}</Badge>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[hsl(var(--muted))]">
                  <div>{project.region ?? project.market}</div>
                  <div>Delivery: {formatDate(project.expectedDeliveryDate)}</div>
                  {project.expectedPowerMw !== null ? (
                    <div>{formatNumber(project.expectedPowerMw)} MW</div>
                  ) : null}
                  {project.expectedAreaSqm !== null ? (
                    <div>{formatNumber(project.expectedAreaSqm)} sqm</div>
                  ) : null}
                  {project.sponsorName ? <div>Sponsor: {project.sponsorName}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
