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
  pick: (json: Record<string, unknown>) => string;
  hint: string;
};

function pickMarkdown(json: Record<string, unknown>): string {
  const md = json.markdown;
  if (typeof md === 'string' && md.trim()) return md;
  return JSON.stringify(json, null, 2);
}

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
  }
];

export function DealAnalyzerPanel({ dealId, analyzerDealId, configured }: Props) {
  const [overview, setOverview] = useState<AnalyzerOverview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<{ title: string; text: string } | null>(null);

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
      const json = await call(action.method, action.path, {});
      setOutput({ title: action.label, text: action.pick(json) });
      await refresh();
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
  const prememoName = `prememo_${analyzerDealId}_draft.docx`;
  const hasPrememo = Boolean(overview?.outputs?.[prememoName]);

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
            <div className="fine-print">사전협의서</div>
            <div className="mt-3 text-sm text-[hsl(var(--foreground))]">
              {hasPrememo ? (
                <a
                  className="underline"
                  href={`/api/deals/${dealId}/analyzer/docs/outputs/${prememoName}`}
                >
                  docx 내려받기
                </a>
              ) : (
                '아직 없음'
              )}
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

      {error ? <p className="text-sm text-[hsl(var(--danger))]">{error}</p> : null}

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
