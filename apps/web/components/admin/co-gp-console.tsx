'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * Co-GP operator console (benchmark #10 UI).
 *
 * Three independent panels that POST to the already-shipped admin co-GP routes
 * (/api/admin/co-gp/{ic-memo,notice,lp-qa}) and render the returned draft. Each
 * panel owns its own input + busy/error/result state; nothing is shared, so a
 * failure in one never blocks another. Read-mostly: it only triggers generation.
 */

type RequestState<T> = { busy: boolean; error: string | null; result: T | null };

function useGenerator<T>() {
  const [state, setState] = useState<RequestState<T>>({
    busy: false,
    error: null,
    result: null
  });

  async function run(url: string, body: unknown) {
    setState({ busy: true, error: null, result: null });
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? `Request failed (${response.status})`);
      }
      setState({ busy: false, error: null, result: (payload ?? null) as T | null });
    } catch (caughtError) {
      setState({
        busy: false,
        error: caughtError instanceof Error ? caughtError.message : 'Request failed',
        result: null
      });
    }
  }

  return { state, run };
}

function Pre({ value }: { value: unknown }) {
  return (
    <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-slate-950/60 p-4 text-xs text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function PanelShell({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </Card>
  );
}

function IcMemoPanel() {
  const [dealId, setDealId] = useState('');
  const { state, run } = useGenerator<{ draft: unknown }>();
  return (
    <PanelShell
      title="IC memo draft"
      description="Generate a committee-ready memo skeleton from a deal's context."
    >
      <Input placeholder="Deal ID" value={dealId} onChange={(e) => setDealId(e.target.value)} />
      <Button
        disabled={state.busy || !dealId.trim()}
        onClick={() => run('/api/admin/co-gp/ic-memo', { dealId: dealId.trim() })}
      >
        {state.busy ? 'Generating…' : 'Generate IC memo'}
      </Button>
      {state.error ? <p className="text-sm text-[hsl(var(--danger))]">{state.error}</p> : null}
      {state.result ? <Pre value={state.result.draft} /> : null}
    </PanelShell>
  );
}

function NoticePanel() {
  const [fundId, setFundId] = useState('');
  const [recordId, setRecordId] = useState('');
  const [kind, setKind] = useState<'CAPITAL_CALL' | 'DISTRIBUTION'>('CAPITAL_CALL');
  const { state, run } = useGenerator<{ notice: unknown }>();
  return (
    <PanelShell
      title="Capital-call / distribution notice"
      description="Draft an LP notice for a specific capital-call or distribution record."
    >
      <select
        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
        value={kind}
        onChange={(e) => setKind(e.target.value as 'CAPITAL_CALL' | 'DISTRIBUTION')}
      >
        <option value="CAPITAL_CALL">Capital call</option>
        <option value="DISTRIBUTION">Distribution</option>
      </select>
      <Input placeholder="Fund ID" value={fundId} onChange={(e) => setFundId(e.target.value)} />
      <Input
        placeholder={kind === 'CAPITAL_CALL' ? 'Capital call ID' : 'Distribution ID'}
        value={recordId}
        onChange={(e) => setRecordId(e.target.value)}
      />
      <Button
        disabled={state.busy || !fundId.trim() || !recordId.trim()}
        onClick={() =>
          run('/api/admin/co-gp/notice', {
            fundId: fundId.trim(),
            kind,
            recordId: recordId.trim()
          })
        }
      >
        {state.busy ? 'Generating…' : 'Generate notice'}
      </Button>
      {state.error ? <p className="text-sm text-[hsl(var(--danger))]">{state.error}</p> : null}
      {state.result ? <Pre value={state.result.notice} /> : null}
    </PanelShell>
  );
}

function LpQaPanel() {
  const [question, setQuestion] = useState('');
  const [fundId, setFundId] = useState('');
  const { state, run } = useGenerator<{ answer: unknown }>();
  return (
    <PanelShell
      title="LP Q&A"
      description="Answer an LP question grounded in the fund's PCAP + deal pipeline."
    >
      <Textarea
        placeholder="LP question"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
      />
      <Input
        placeholder="Fund ID (optional)"
        value={fundId}
        onChange={(e) => setFundId(e.target.value)}
      />
      <Button
        disabled={state.busy || !question.trim()}
        onClick={() =>
          run('/api/admin/co-gp/lp-qa', {
            question: question.trim(),
            ...(fundId.trim() ? { fundId: fundId.trim() } : {})
          })
        }
      >
        {state.busy ? 'Answering…' : 'Answer question'}
      </Button>
      {state.error ? <p className="text-sm text-[hsl(var(--danger))]">{state.error}</p> : null}
      {state.result ? <Pre value={state.result.answer} /> : null}
    </PanelShell>
  );
}

export function CoGpConsole() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <IcMemoPanel />
      <NoticePanel />
      <LpQaPanel />
    </div>
  );
}
