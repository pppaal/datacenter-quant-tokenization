'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

type InitialFilters = {
  actor?: string;
  entityType?: string;
  entityId?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
};

type Props = {
  initial: InitialFilters;
};

const SEVERITY_OPTIONS = [
  { value: '', label: 'Any severity' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'WARN', label: 'Warning' },
  { value: 'ERROR', label: 'Error' },
  { value: 'CRITICAL', label: 'Critical' }
];

export function AuditLogFilters({ initial }: Props) {
  const router = useRouter();
  const [actor, setActor] = useState(initial.actor ?? '');
  const [entityType, setEntityType] = useState(initial.entityType ?? '');
  const [entityId, setEntityId] = useState(initial.entityId ?? '');
  const [severity, setSeverity] = useState(initial.severity ?? '');
  const [startDate, setStartDate] = useState(initial.startDate ?? '');
  const [endDate, setEndDate] = useState(initial.endDate ?? '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (actor.trim()) params.set('actor', actor.trim());
    if (entityType.trim()) params.set('entityType', entityType.trim());
    if (entityId.trim()) params.set('entityId', entityId.trim());
    if (severity.trim()) params.set('severity', severity.trim());
    if (startDate.trim()) params.set('startDate', startDate.trim());
    if (endDate.trim()) params.set('endDate', endDate.trim());
    const query = params.toString();
    router.push(query.length > 0 ? `/admin/audit?${query}` : '/admin/audit');
  }

  function handleClear() {
    setActor('');
    setEntityType('');
    setEntityId('');
    setSeverity('');
    setStartDate('');
    setEndDate('');
    router.push('/admin/audit');
  }

  return (
    <Card className="space-y-5">
      <div>
        <div className="eyebrow">Filters</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Refine the audit ledger</h2>
        <p className="mt-1 text-sm text-slate-400">
          Combine actor, entity, severity, and date range to scope the audit feed.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="fine-print">Actor</span>
            <Input
              type="text"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              placeholder="user@example.com"
              autoComplete="off"
            />
          </label>
          <label className="space-y-2">
            <span className="fine-print">Entity Type</span>
            <Input
              type="text"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="committee_packet"
              autoComplete="off"
            />
          </label>
          <label className="space-y-2">
            <span className="fine-print">Entity ID</span>
            <Input
              type="text"
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
              placeholder="cuid value"
              autoComplete="off"
            />
          </label>
          <label className="space-y-2">
            <span className="fine-print">Severity</span>
            <Select value={severity} onChange={(event) => setSeverity(event.target.value)}>
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="fine-print">Start Date</span>
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="space-y-2">
            <span className="fine-print">End Date</span>
            <Input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary">
            Apply filters
          </Button>
          <Button type="button" variant="secondary" onClick={handleClear}>
            Clear all
          </Button>
        </div>
      </form>
    </Card>
  );
}
