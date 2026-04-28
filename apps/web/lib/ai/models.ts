/**
 * Centralized model identifiers for AI providers used across the app.
 *
 * Prefer importing from this module rather than hard-coding model strings.
 * Each constant exposes a default and an env override so individual call
 * sites can be tuned (e.g. `ANTHROPIC_NARRATIVE_MODEL` for the quarterly
 * narrative pipeline) without touching code.
 *
 * Defaults follow the latest tier appropriate for the workload:
 *   - long-form analysis / memos     → Anthropic Opus 4.7
 *   - lightweight extraction         → OpenAI gpt-4o-mini
 */

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

/**
 * OpenAI model used for document extraction and short-form summaries.
 * Override via `OPENAI_MODEL`.
 */
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
export function openaiModel(): string {
  return readEnv('OPENAI_MODEL') ?? OPENAI_DEFAULT_MODEL;
}

/**
 * Default Anthropic model for long-form structured analysis (narratives,
 * memos, research-agent answers). Override per call-site via the dedicated
 * env var (e.g. `ANTHROPIC_NARRATIVE_MODEL`) — the override takes
 * precedence over `ANTHROPIC_DEFAULT_MODEL`.
 */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-7';

/**
 * Resolve an Anthropic model. Pass the call-site override env name (if
 * any) and this returns either that override, the global override
 * (`ANTHROPIC_DEFAULT_MODEL_OVERRIDE`), or the hard-coded default.
 */
export function anthropicModel(callSiteEnv?: string): string {
  if (callSiteEnv) {
    const callSite = readEnv(callSiteEnv);
    if (callSite) return callSite;
  }
  return readEnv('ANTHROPIC_DEFAULT_MODEL_OVERRIDE') ?? ANTHROPIC_DEFAULT_MODEL;
}
