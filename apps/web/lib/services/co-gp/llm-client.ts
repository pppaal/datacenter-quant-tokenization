/**
 * Co-GP LLM seam (benchmark #10).
 *
 * A single injectable `CompletionFn` abstraction so every co-GP workload (IC-memo
 * draft, capital-call/distribution notices, LP Q&A) is unit-testable with a fake
 * completion and shares ONE place that owns timeout + retry + model resolution.
 * Mirrors the proven `investment-memo.ts` Anthropic pattern (25s AbortController,
 * 3 attempts, exponential backoff with jitter, retry only transient errors).
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';
import { anthropicModel } from '@/lib/ai/models';

export type CompletionRequest = {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type CompletionResult = {
  content: string;
  model?: string;
  promptTokens?: number | null;
  completionTokens?: number | null;
};

export type CompletionFn = (req: CompletionRequest) => Promise<CompletionResult>;

const LLM_TIMEOUT_MS = 25_000;
const LLM_MAX_ATTEMPTS = 3;
const LLM_BACKOFF_BASE_MS = 500;

/** Retry only transient failures (network/timeout/5xx/429); never auth/validation. */
export function isRetryableLlmError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; name?: string; message?: string };
  if (
    e.name === 'AbortError' ||
    /abort|timeout|ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN/i.test(e.message ?? '')
  ) {
    return true;
  }
  if (typeof e.status === 'number') {
    return e.status === 408 || e.status === 409 || e.status === 429 || e.status >= 500;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip prompt-injection vectors from a free-text field that reaches the LLM
 * (fence/role markers, control chars, newline abuse) and cap its length. The
 * co-GP free-text inputs (LP question, notice reason, document excerpts) are the
 * injection surface, so they are sanitized before being embedded in a prompt.
 */
export function sanitizeFreeText(value: string, maxLen = 2000): string {
  return value
    .replace(/[`<>]/g, ' ')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Build the real Anthropic-backed completion fn, or `null` when no API key is
 * configured (callers then fall back to their deterministic offline template).
 */
export function createAnthropicCompletionFn(
  callSiteEnv = 'ANTHROPIC_COGP_MODEL'
): CompletionFn | null {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) return null;
  const client = new Anthropic({ apiKey: key });
  const model = anthropicModel(callSiteEnv);

  return async (req) => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= LLM_MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: req.maxTokens ?? 2000,
            temperature: req.temperature ?? 0.3,
            system: req.systemPrompt,
            messages: [{ role: 'user', content: req.userPrompt }]
          },
          { signal: controller.signal }
        );
        clearTimeout(timer);
        const first = response.content[0];
        if (!first || first.type !== 'text') {
          throw new Error('Claude returned no text content');
        }
        return {
          content: first.text,
          model: attempt === 1 ? model : `${model} (attempt ${attempt})`,
          promptTokens: response.usage?.input_tokens ?? null,
          completionTokens: response.usage?.output_tokens ?? null
        };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (attempt >= LLM_MAX_ATTEMPTS || !isRetryableLlmError(err)) break;
        const backoff = LLM_BACKOFF_BASE_MS * 2 ** (attempt - 1);
        await sleep(backoff * (0.5 + Math.random() * 0.5));
      }
    }
    throw lastError ?? new Error('co-GP completion failed');
  };
}
