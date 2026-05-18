import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { listReadinessProjects } from '@/lib/services/readiness';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ReadinessPage() {
  const projects = await listReadinessProjects();

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Review Readiness</div>
        <h2 className="mt-2 text-3xl font-semibold text-white">
          Committee evidence and readiness layer
        </h2>
      </div>
      <div className="grid gap-5">
        {projects.map((project) => (
          <Card key={project.id}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white">{project.asset.name}</div>
                <div className="mt-1 text-sm text-slate-400">
                  Review package / evidence readiness
                </div>
              </div>
              <Badge tone={project.readinessStatus === 'READY' ? 'good' : 'warn'}>
                {project.readinessStatus}
              </Badge>
            </div>
            <p className="mt-4 text-sm text-slate-400">{project.nextAction}</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {project.onchainRecords.map((record) => (
                <div
                  key={record.id}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-5 text-sm text-slate-300"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">
                      {record.recordType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-slate-500">{formatDate(record.createdAt)}</span>
                  </div>
                  <div className="mt-2 text-slate-400">
                    Evidence: {record.document?.title ?? 'Pending'} / Status: {record.status}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
