import OpenAI from 'openai';
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
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
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
