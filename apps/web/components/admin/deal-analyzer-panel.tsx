'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { AnalyzerOverview } from '@/lib/services/analyzer';

type Props = {
  dealId: string;
  analyzerDealId: string;
  configured: boolean;
};

type Action = {
  key: string;
  label: string;
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  pick: (json: Record<string, unknown>) => string;
  hint: string;
};

type MemoSpec = 'prememo' | 'icmemo' | 'approval';

const MEMOS: { spec: MemoSpec; label: string }[] = [
  { spec: 'prememo', label: '사전협의서' },
  { spec: 'icmemo', label: '투자심의 메모' },
  { spec: 'approval', label: '여신 승인신청' }
];

function pickMarkdown(json: Record<string, unknown>): string {
  const md = json.markdown;
  if (typeof md === 'string' && md.trim()) return md;
  return JSON.stringify(json, null, 2);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Agent company status/run: the analyzer's own summary text, then the latest work-log lines. */
function pickAgents(json: Record<string, unknown>): string {
  const status = (json.status ?? json) as Record<string, unknown>;
  const text = typeof json.text === 'string' && json.text.trim() ? json.text : pickMarkdown(status);
  const timeline = (status.timeline ?? {}) as Record<string, unknown>;
  const lines = stringList(timeline.lines);
  return lines.length ? `${text}\n\n업무일지 (최근 ${lines.length}줄)\n${lines.join('\n')}` : text;
}

/** Hash-chained work ledger, newest first, with the chain check result. */
function pickLedger(json: Record<string, unknown>): string {
  const entries = Array.isArray(json.entries) ? (json.entries as Record<string, unknown>[]) : [];
  const verify = (json.verify ?? null) as Record<string, unknown> | null;
  const head = verify
    ? verify.ok
      ? `해시 사슬 정상 · 기록 ${String(verify.count ?? entries.length)}건`
      : `해시 사슬 깨짐 — ${String(verify.broken_at ?? '?')}번째 기록부터`
    : `기록 ${entries.length}건`;
  const rows = entries.map((e) => {
    const what = [e.text, e.title, e.kind].find((v) => typeof v === 'string' && v) ?? '';
    return `#${String(e.seq ?? '?')} ${String(e.ts ?? '').slice(0, 16)} · ${String(e.type ?? '')} · ${String(e.role ?? e.operator ?? '')} · ${String(what)}`;
  });
  return [head, '', ...rows].join('\n');
}

const AGENT_ACTIONS: Action[] = [
  {
    key: 'agents',
    label: '에이전트 회사 현황',
    method: 'GET',
    path: 'agents',
    pick: pickAgents,
    hint: '딜부서 → 법인 → IB리스크심의회 → 심사부·심사역협의회, 감사가 전 과정 감시. 지금 공을 가진 곳·부서별 지적·사람 조치'
  },
  {
    key: 'agents-simulate',
    label: '모의 진행',
    method: 'POST',
    path: 'agents/run',
    body: { mode: 'simulate' },
    pick: pickAgents,
    hint: '추천대로 결정된다고 가정하고 끝까지 — 승인 체인 기록은 건드리지 않음 (agents/simulation/ 에만 씀)'
  },
  {
    key: 'agents-official',
    label: '공식 진행',
    method: 'POST',
    path: 'agents/run',
    body: { mode: 'official' },
    pick: pickAgents,
    hint: '지금 단계를 부서들이 점검·보완하고, 모두 서명하면 에이전트가 제출 → 사람 결재 대기에서 멈춤 (결정은 사람만)'
  },
  {
    key: 'agents-ledger',
    label: '업무 기록',
    method: 'GET',
    path: 'agents/ledger',
    pick: pickLedger,
    hint: '에이전트가 한 일·지적·넘김·사람 처리 기록 (붙이기만 하는 해시 사슬) 최근 100건'
  }
];

const ACTIONS: Action[] = [
  {
    key: 'digest',
    label: '요약본',
    method: 'POST',
    path: 'docs/digest',
    pick: pickMarkdown,
    hint: '문서 전체를 수천 토큰으로 압축한 요약 (로컬)'
  },
  {
    key: 'review',
    label: '대조·관점',
    method: 'POST',
    path: 'docs/review',
    pick: pickMarkdown,
    hint: '버전·누락·문서 간 불일치·메모 검증'
  },
  {
    key: 'facts',
    label: '사실 사전',
    method: 'GET',
    path: 'docs/facts',
    pick: pickMarkdown,
    hint: '완독 메모를 표준 키로 묶은 근거 목록'
  },
  {
    key: 'gaps',
    label: '빈칸 2차 읽기',
    method: 'POST',
    path: 'docs/gaps',
    pick: pickMarkdown,
    hint: '표준 키 중 비어 있는 항목과 후보 쪽'
  },
  {
    key: 'prememo',
    label: '사전협의서 초안',
    method: 'POST',
    path: 'docs/prememo',
    pick: (json) =>
      `${typeof json.out === 'string' ? `생성: ${json.out}\n\n` : ''}${pickMarkdown(json)}`,
    hint: '은행 서식 docx + 숫자 역검증 점검표'
  },
  {
    key: 'model',
    label: '자체 모델',
    method: 'POST',
    path: 'docs/model_bl',
    pick: (json) =>
      `${pickMarkdown(json)}\n\n${typeof json.check_markdown === 'string' ? json.check_markdown : ''}`,
    hint: '스폰서 엑셀을 다시 계산해 대조한 반기 현금흐름'
  },
  {
    key: 'icmemo',
    label: '투자심의 메모 초안',
    method: 'POST',
    path: 'docs/prememo',
    body: { spec: 'icmemo' },
    pick: (json) =>
      `${typeof json.out === 'string' ? `생성: ${json.out}\n\n` : ''}${pickMarkdown(json)}`,
    hint: '부동산 투자심의 서식 docx (물건 개요·임대차·수익성·리스크)'
  },
  {
    key: 'approval',
    label: '여신 승인신청 초안',
    method: 'POST',
    path: 'docs/prememo',
    body: { spec: 'approval' },
    pick: (json) =>
      `${typeof json.out === 'string' ? `생성: ${json.out}\n\n` : ''}${pickMarkdown(json)}`,
    hint: '심사역협의회 승인신청서 서식 docx (수익성·RWA·BIS, 별첨 체크리스트, 심사 예상 질의)'
  },
  {
    key: 'checklists',
    label: '체크리스트 점검',
    method: 'POST',
    path: 'docs/checklists',
    pick: pickMarkdown,
    hint: 'IB리스크심의회 부의·법률점검·현장실사·심사보고서·적도원칙·K-택소노미 항목을 근거와 함께 미리 판정'
  },
  {
    key: 'bank_metrics',
    label: '수익성·RWA 계산',
    method: 'POST',
    path: 'docs/bank_metrics',
    pick: pickMarkdown,
    hint: '조달 구조별 All-in 마진·RORWA, 기간 가중 위험가중치, BIS비율 영향 (participation.json 입력 기준)'
  },
  {
    key: 'workflow',
    label: '심사 단계 현황',
    method: 'GET',
    path: 'workflow',
    pick: (json) =>
      typeof json.text === 'string' && json.text.trim() ? json.text : pickMarkdown(json),
    hint: '우리팀 → 법인 → IB리스크심의회 → 심사역협의회 현재 단계와 제출 점검'
  },
  {
    key: 'kr_docs',
    label: '한국 서류 파싱',
    method: 'POST',
    path: 'docs/kr_docs',
    pick: pickMarkdown,
    hint: '등기부등본·건축물대장·임대차계약서를 규칙으로 읽어 사실 사전에 넣음 (토큰 0)'
  },
  {
    key: 'rentroll',
    label: '렌트롤·운영수지',
    method: 'POST',
    path: 'docs/rentroll',
    pick: pickMarkdown,
    hint: '임차인별 행 + 연임대료·임대율·WAULT·집중도·만기 분포 (계산값은 구성 행이 원문에 있어야 검증)'
  },
  {
    key: 'injection',
    label: '숨은 글자·지시 점검',
    method: 'POST',
    path: 'docs/injection',
    pick: pickMarkdown,
    hint: 'AI를 겨냥한 지시문, 흰 글씨·초소형 글씨, 보이지 않는 글자, 숨은 시트를 찾아 적음'
  }
];

export function DealAnalyzerPanel({ dealId, analyzerDealId, configured }: Props) {
  const [overview, setOverview] = useState<AnalyzerOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<{ title: string; text: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [findingId, setFindingId] = useState('');
  const [findingNote, setFindingNote] = useState('');

  const call = useCallback(
    async (method: 'GET' | 'POST', path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`/api/deals/${dealId}/analyzer/${path}`, {
        method,
        headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        credentials: 'same-origin',
        cache: 'no-store'
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        const message =
          typeof json.error === 'string'
            ? json.error
            : typeof json.detail === 'string'
              ? json.detail
              : `HTTP ${response.status}`;
        throw new Error(message);
      }
      return json;
    },
    [dealId]
  );

  const refresh = useCallback(async () => {
    if (!configured) return;
    try {
      const json = (await call('GET', 'docs/overview')) as unknown as AnalyzerOverview;
      setOverview(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [call, configured]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: Action) => {
    setBusy(action.key);
    setError(null);
    try {
      const json = await call(action.method, action.path, action.body ?? {});
      setOutput({ title: action.label, text: action.pick(json) });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const saveMemo = async (spec: MemoSpec, label: string) => {
    setBusy(`save-${spec}`);
    setError(null);
    setSaved(null);
    try {
      const json = await call('POST', 'save-memo', { spec });
      const version = typeof json.version === 'number' ? ` v${json.version}` : '';
      setSaved(
        `${label} 초안을 딜 문서(보고서)로 저장했습니다${version}. IC 패킷 검토 때 딜 문서 목록에서 열 수 있습니다.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleFinding = async (waive: boolean) => {
    const id = findingId.trim();
    const note = findingNote.trim();
    if (!/^F-[0-9a-f]{6,16}$/.test(id) || !note) {
      setError('지적 id(F-…)와 확인 메모를 모두 적어 주세요.');
      return;
    }
    const key = waive ? 'agents-waive' : 'agents-resolve';
    setBusy(key);
    setError(null);
    try {
      const json = await call('POST', waive ? 'agents/waive' : 'agents/resolve', {
        finding_id: id,
        note
      });
      setOutput({
        title: waive ? `지적 면제 ${id}` : `지적 해소 ${id}`,
        text: pickAgents(json)
      });
      setFindingId('');
      setFindingNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (!configured) {
    return (
      <Card className="space-y-3">
        <div className="eyebrow">Document Analyzer</div>
        <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">문서 분석 (미설정)</h2>
        <p className="text-sm text-[hsl(var(--foreground-muted))]">
          ANALYZER_URL과 ANALYZER_SERVICE_TOKEN이 설정되면 이 딜의 문서를 분석기가 읽고
          요약본·대조·사실 사전·사전협의서·모델을 여기서 볼 수 있습니다.
          docs/analyzer-integration.md 참조.
        </p>
      </Card>
    );
  }

  const gate = overview?.gate ?? null;
  const aiAllowed = gate?.extract?.allowed ?? false;
  const memoFiles = MEMOS.map((memo) => {
    const name = `${memo.spec}_${analyzerDealId}_draft.docx`;
    return { ...memo, name, ready: Boolean(overview?.outputs?.[name]) };
  });

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">Document Analyzer</div>
          <h2 className="mt-2 text-2xl font-semibold text-[hsl(var(--foreground))]">
            문서 분석 · 근거 있는 읽기
          </h2>
          <p className="mt-1 text-sm text-[hsl(var(--foreground-muted))]">
            분석기 딜 ID <code>{analyzerDealId}</code> · 숫자마다 [D# p#] 출처 · 내부 메모는 근거
            불인정
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={overview?.exists ? 'good' : 'neutral'}>
            {overview
              ? overview.exists
                ? `문서 ${overview.files}개`
                : '문서 없음'
              : '상태 확인 중'}
          </Badge>
          <Badge tone={overview?.nda_registered ? 'good' : 'warn'}>
            {overview?.nda_registered ? 'NDA 등록됨' : 'NDA 미등록'}
          </Badge>
          <Badge tone={aiAllowed ? 'good' : 'danger'}>
            {aiAllowed ? 'AI 읽기 허용' : 'AI 읽기 차단 (로컬만)'}
          </Badge>
          <Button variant="ghost" type="button" onClick={() => void refresh()}>
            새로고침
          </Button>
        </div>
      </div>

      {overview?.exists ? (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="metric-card">
            <div className="fine-print">색인 쪽수</div>
            <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
              {overview.index?.pages ?? 0}
            </div>
          </div>
          <div className="metric-card">
            <div className="fine-print">완독 메모 쪽수</div>
            <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
              {overview.fullread_pages ?? 0}
            </div>
          </div>
          <div className="metric-card">
            <div className="fine-print">산출물</div>
            <div className="mt-3 text-3xl font-semibold text-[hsl(var(--foreground))]">
              {Object.keys(overview.outputs ?? {}).length}
            </div>
          </div>
          <div className="metric-card">
            <div className="fine-print">메모 초안</div>
            <div className="mt-3 space-y-2 text-sm text-[hsl(var(--foreground))]">
              {memoFiles.map((memo) => (
                <div key={memo.spec} className="flex flex-wrap items-center gap-2">
                  <span>{memo.label}</span>
                  {memo.ready ? (
                    <>
                      <a
                        className="underline"
                        href={`/api/deals/${dealId}/analyzer/docs/outputs/${memo.name}`}
                      >
                        docx
                      </a>
                      <Button
                        variant="ghost"
                        type="button"
                        disabled={busy !== null}
                        title="딜에 연결된 자산의 문서(보고서)로 저장 — 버전 관리, IC 패킷 검토용"
                        onClick={() => void saveMemo(memo.spec, memo.label)}
                      >
                        {busy === `save-${memo.spec}` ? '저장 중…' : '딜 문서로 저장'}
                      </Button>
                    </>
                  ) : (
                    <span className="text-[hsl(var(--foreground-muted))]">아직 없음</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[hsl(var(--foreground-muted))]">
          이 딜로 올린 실사 문서가 아직 분석기에 없습니다. 실사 워크스트림이나 문서 업로드로 올리면
          자동으로 전달됩니다.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant="secondary"
            disabled={busy !== null || !overview?.exists}
            title={action.hint}
            onClick={() => void run(action)}
          >
            {busy === action.key ? `${action.label}…` : action.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4">
        <div>
          <div className="fine-print">에이전트 회사</div>
          <p className="mt-1 text-xs text-[hsl(var(--foreground-muted))]">
            부서 에이전트가 서로 점검하고 추천·제출까지만 합니다. 단계 결정(결재)은 승인 체인에서
            사람이 기록합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {AGENT_ACTIONS.map((action) => (
            <Button
              key={action.key}
              type="button"
              variant="secondary"
              disabled={busy !== null || !overview?.exists}
              title={action.hint}
              onClick={() => void run(action)}
            >
              {busy === action.key ? `${action.label}…` : action.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="w-40 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-sm"
            placeholder="지적 id (F-…)"
            value={findingId}
            onChange={(event) => setFindingId(event.target.value)}
          />
          <input
            className="min-w-[16rem] flex-1 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1 text-sm"
            placeholder="무엇을 확인했는지 (필수 — 업무 기록에 이름과 함께 남음)"
            value={findingNote}
            onChange={(event) => setFindingNote(event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            title="고쳤음 — 다음 실행에서 부서가 다시 점검합니다"
            onClick={() => void handleFinding(false)}
          >
            {busy === 'agents-resolve' ? '처리 중…' : '지적 해소'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy !== null}
            title="위험을 받아들임 — 다음 실행에서 막지 않습니다 (관리자만)"
            onClick={() => void handleFinding(true)}
          >
            {busy === 'agents-waive' ? '처리 중…' : '지적 면제 (관리자)'}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-[hsl(var(--danger))]">{error}</p> : null}
      {saved ? <p className="text-sm text-[hsl(var(--success))]">{saved}</p> : null}

      {output ? (
        <div className="space-y-2">
          <div className="fine-print">{output.title}</div>
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-4 text-xs leading-relaxed text-[hsl(var(--foreground))]">
            {output.text}
          </pre>
        </div>
      ) : null}

      <p className="text-xs text-[hsl(var(--muted))]">
        모든 계산은 분석기 서버 안에서만 돌고, 외부 AI 모델로 보내는 읽기는 분석기의 딜별 NDA
        게이트가 허용할 때만 일어납니다. (초안) 표시 문장은 심사역이 고칩니다.
      </p>
    </Card>
  );
}
