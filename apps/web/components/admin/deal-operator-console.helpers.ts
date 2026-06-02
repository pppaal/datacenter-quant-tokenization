// Pure, component-scope-free helpers for the deal operator console. Kept out of
// the (large, stateful) console component so they can be unit-reasoned and reused
// without pulling in the client component graph.

export function getMatchSuggestion(value: unknown): {
  documentId: string;
  documentTitle: string;
  score: number;
  suggestedAt?: string;
  competingRequestTitles: string[];
} | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.documentId !== 'string' || typeof candidate.documentTitle !== 'string')
    return null;
  return {
    documentId: candidate.documentId,
    documentTitle: candidate.documentTitle,
    score: typeof candidate.score === 'number' ? candidate.score : 0,
    suggestedAt: typeof candidate.suggestedAt === 'string' ? candidate.suggestedAt : undefined,
    competingRequestTitles: Array.isArray(candidate.competingRequestTitles)
      ? candidate.competingRequestTitles.filter((item): item is string => typeof item === 'string')
      : []
  };
}

export function toDateValue(value?: string | Date | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export async function postJson(
  url: string,
  method: 'POST' | 'PATCH',
  payload: Record<string, unknown>
) {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Request failed');
  }
}
