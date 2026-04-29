import { FeatureSnapshotPanel } from '@/components/admin/feature-snapshot-panel';
import { DocumentUploadForm } from '@/components/admin/document-upload-form';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listDocuments } from '@/lib/services/documents';
import { formatDate, formatNumber } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type CreditMetrics = {
  currentRatio?: number | null;
  currentMaturityCoverage?: number | null;
};

export default async function DocumentsPage() {
  const documents = await listDocuments();

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Data Room</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Documents, summaries, and version history
        </h2>
      </div>
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="eyebrow">Upload</div>
          <div className="mt-5">
            <DocumentUploadForm />
          </div>
        </Card>
        <Card>
          <div className="eyebrow">Tracked Documents</div>
          <div className="mt-4 space-y-4">
            {documents.map((document) => (
              <div
                key={document.id}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5"
              >
                {(() => {
                  const sourceVersion = `document:${document.id}:v${document.currentVersion}`;
                  const promotedSnapshots = document.asset.featureSnapshots.filter(
                    (snapshot) => snapshot.sourceVersion === sourceVersion
                  );

                  return (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="font-semibold text-white">{document.title}</div>
                          <div className="text-sm text-slate-400">
                            {document.asset.name} / {document.documentType}
                          </div>
                        </div>
                        <div className="text-sm text-slate-500">v{document.currentVersion}</div>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-400">{document.aiSummary}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {document.versions[0]?.extractionRuns[0] ? (
                          <Badge tone="good">
                            Extraction {document.versions[0].extractionRuns[0].status}
                          </Badge>
                        ) : (
                          <Badge tone="warn">No extraction</Badge>
                        )}
                        <Badge>
                          Facts {formatNumber(document.versions[0]?.facts.length ?? 0, 0)}
                        </Badge>
                        {promotedSnapshots.map((snapshot) => (
                          <Badge key={snapshot.id} tone="good">
                            Promoted {snapshot.featureNamespace}
                          </Badge>
                        ))}
                      </div>
                      {document.versions[0]?.facts.length ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {document.versions[0].facts.map((fact) => (
                            <div
                              key={fact.id}
                              className="rounded-2xl border border-border bg-slate-950/40 p-4"
                            >
                              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                {fact.factKey}
                              </div>
                              <div className="mt-2 text-sm text-white">
                                {fact.factValueText ??
                                  (fact.factValueNumber !== null &&
                                  fact.factValueNumber !== undefined
                                    ? `${formatNumber(fact.factValueNumber, 2)}${fact.unit ? ` ${fact.unit}` : ''}`
                                    : 'N/A')}
                              </div>
                              <div className="mt-2 text-xs text-slate-500">
                                {fact.factType} / confidence {formatNumber(fact.confidenceScore, 2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {document.versions[0]?.financialStatements.length ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {document.versions[0].financialStatements.map((statement) => {
                            const latestAssessment = statement.creditAssessments[0];
                            const metrics =
                              latestAssessment?.metrics &&
                              typeof latestAssessment.metrics === 'object'
                                ? (latestAssessment.metrics as CreditMetrics)
                                : null;

                            return (
                              <div
                                key={statement.id}
                                className="rounded-2xl border border-border bg-slate-950/40 p-4"
                              >
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                  {statement.counterparty.role} / {statement.statementType}
                                </div>
                                <div className="mt-2 text-sm font-semibold text-white">
                                  {statement.counterparty.name}
                                </div>
                                <div className="mt-2 text-sm text-slate-300">
                                  Revenue{' '}
                                  {formatNumber(statement.revenueKrw?.toNumber() ?? null, 0)} /
                                  EBITDA{' '}
                                  {formatNumber(statement.ebitdaKrw?.toNumber() ?? null, 0)}
                                </div>
                                {metrics ? (
                                  <div className="mt-2 text-xs text-slate-500">
                                    Current ratio{' '}
                                    {metrics.currentRatio
                                      ? `${formatNumber(metrics.currentRatio, 2)}x`
                                      : 'N/A'}{' '}
                                    / Maturity coverage{' '}
                                    {metrics.currentMaturityCoverage
                                      ? `${formatNumber(metrics.currentMaturityCoverage, 2)}x`
                                      : 'N/A'}
                                  </div>
                                ) : null}
                                {latestAssessment ? (
                                  <div className="mt-2 text-xs text-slate-500">
                                    Credit {latestAssessment.riskLevel} / score{' '}
                                    {formatNumber(latestAssessment.score, 0)}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {promotedSnapshots.length ? (
                        <div className="mt-4">
                          <FeatureSnapshotPanel
                            title="Promoted Snapshots"
                            snapshots={promotedSnapshots}
                            emptyMessage="No promoted snapshots for this document version."
                          />
                        </div>
                      ) : null}
                      <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        Updated {formatDate(document.updatedAt)} / Hash{' '}
                        {document.documentHash.slice(0, 12)}
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
