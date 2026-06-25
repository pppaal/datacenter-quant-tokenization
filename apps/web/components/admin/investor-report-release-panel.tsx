'use client';

import { useState } from 'react';
import { InvestorReportReleaseStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRouterRefresh } from '@/lib/hooks/use-router-refresh';

type InvestorReportRecord = {
  id: string;
  title: string;
  reportType: string;
  releaseStatus: InvestorReportReleaseStatus;
  periodEnd: Date | null;
  draftSummary: string | null;
  reviewNotes: string | null;
  publishedAt: Date | null;
  investor: {
    name: string;
  } | null;
};

type InvestorReportReleasePanelProps = {
  reports: InvestorReportRecord[];
};

const releaseOptions: InvestorReportReleaseStatus[] = [
  'DRAFT',
  'INTERNAL_REVIEW',
  'READY',
  'RELEASED'
];

function toneForRelease(status: InvestorReportReleaseStatus) {
  if (status === 'RELEASED') return 'good' as const;
  if (status === 'READY') return 'warn' as const;
  return 'neutral' as const;
}

function formatDateValue(value: Date | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : 'period pending';
}

function ReleaseRow({ report }: { report: InvestorReportRecord }) {
  const { isRefreshing, refresh } = useRouterRefresh();
  const [releaseStatus, setReleaseStatus] = useState<InvestorReportReleaseStatus>(
    report.releaseStatus
  );
  const [draftSummary, setDraftSummary] = useState(report.draftSummary ?? '');
  const [reviewNotes, setReviewNotes] = useState(report.reviewNotes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isReleased = report.releaseStatus === 'RELEASED';

  async function save() {
    setSubmitting(true);
    setFeedback(null);
    setError(null);

    try {
      const response = await fetch(`/api/investor-reports/${report.id}/release`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          releaseStatus,
          draftSummary,
          reviewNotes
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to update investor report release workflow');
      }

      setFeedback(
        releaseStatus === 'RELEASED' ? 'Investor report released.' : 'Release workflow updated.'
      );
      refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to update investor report release workflow'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4"
      data-testid="investor-report-release-row"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {report.title}
            </div>
            <Badge tone={toneForRelease(report.releaseStatus)}>
              {report.releaseStatus.toLowerCase().replaceAll('_', ' ')}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-[hsl(var(--muted))]">
            {report.reportType.toLowerCase().replaceAll('_', ' ')} /{' '}
            {formatDateValue(report.periodEnd)}
            {report.investor ? ` / ${report.investor.name}` : ''}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={save}
          disabled={submitting || isRefreshing || isReleased}
          data-testid="investor-report-release-save"
        >
          {submitting || isRefreshing ? 'Saving...' : isReleased ? 'Released' : 'Save Workflow'}
        </Button>
      </div>

      <div className="mt-4">
        <Select
          value={releaseStatus}
          onChange={(event) => setReleaseStatus(event.target.value as InvestorReportReleaseStatus)}
          disabled={isReleased}
          data-testid="investor-report-release-status"
        >
          {releaseOptions.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <Textarea
          value={draftSummary}
          onChange={(event) => setDraftSummary(event.target.value)}
          className="min-h-[110px]"
          placeholder="Draft summary for investor release"
          disabled={isReleased}
        />
        <Textarea
          value={reviewNotes}
          onChange={(event) => setReviewNotes(event.target.value)}
          className="min-h-[110px]"
          placeholder="Internal review notes and release conditions"
          disabled={isReleased}
        />
      </div>

      {report.publishedAt ? (
        <div className="mt-3 text-xs text-[hsl(var(--success))]">
          Released {formatDateValue(report.publishedAt)}
        </div>
      ) : null}
      {feedback ? <div className="mt-2 text-sm text-[hsl(var(--success))]">{feedback}</div> : null}
      {error ? <div className="mt-2 text-sm text-[hsl(var(--danger))]">{error}</div> : null}
    </div>
  );
}

export function InvestorReportReleasePanel({ reports }: InvestorReportReleasePanelProps) {
  const unreleasedReports = reports.filter((report) => report.releaseStatus !== 'RELEASED');
  const releasedReports = reports.filter((report) => report.releaseStatus === 'RELEASED');

  return (
    <Card>
      <div className="eyebrow">Investor Reporting Release Workflow</div>
      <p className="mt-3 text-sm leading-7 text-[hsl(var(--muted))]">
        Keep LP communications in controlled draft, internal review, ready, and released states.
        Released reports stay immutable in the workflow and preserve their publication timestamp.
      </p>

      <div className="mt-6 space-y-3">
        {unreleasedReports.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4 text-sm text-[hsl(var(--muted))]">
            No unreleased investor report is currently staged.
          </div>
        ) : (
          unreleasedReports.map((report) => <ReleaseRow key={report.id} report={report} />)
        )}
      </div>

      {releasedReports.length > 0 ? (
        <div className="mt-6">
          <div className="fine-print">Released Reports</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {releasedReports.map((report) => (
              <Badge key={report.id} tone="good">
                {report.title}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
