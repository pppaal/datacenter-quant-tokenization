/**
 * Co-GP agent public surface (benchmark #10). See `co-gp.ts` for the workloads and
 * `llm-client.ts` for the injectable completion seam.
 */
export * from '@/lib/services/co-gp/co-gp';
export {
  type CompletionFn,
  type CompletionRequest,
  type CompletionResult,
  createAnthropicCompletionFn,
  isRetryableLlmError,
  sanitizeFreeText
} from '@/lib/services/co-gp/llm-client';
