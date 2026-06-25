import OpenAI from 'openai';
import { env } from '@/lib/env';
import { openaiModel } from './models';

/**
 * @deprecated Read at module load — does not honor runtime env changes.
 * Prefer `openaiModel()` from `@/lib/ai/models`.
 */
export const OPENAI_MODEL = openaiModel();

export class OpenAIConfigurationError extends Error {
  constructor(message = 'AI assistant is not configured. Set OPENAI_API_KEY to enable.') {
    super(message);
    this.name = 'OpenAIConfigurationError';
  }
}

let cachedClient: OpenAI | null = null;

export function isOpenAIConfigured(): boolean {
  return Boolean(env().OPENAI_API_KEY);
}

export function getOpenAIClient(): OpenAI {
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAIConfigurationError();
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey });
  }
  return cachedClient;
}

export function resetOpenAIClientForTesting() {
  cachedClient = null;
}
