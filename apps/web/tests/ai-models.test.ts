import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANTHROPIC_DEFAULT_MODEL,
  OPENAI_DEFAULT_MODEL,
  anthropicModel,
  openaiModel
} from '@/lib/ai/models';

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key]!;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('openaiModel falls back to the default when env is unset', () => {
  withEnv({ OPENAI_MODEL: undefined }, () => {
    assert.equal(openaiModel(), OPENAI_DEFAULT_MODEL);
  });
});

test('openaiModel honors OPENAI_MODEL override and trims whitespace', () => {
  withEnv({ OPENAI_MODEL: '  gpt-5-experimental  ' }, () => {
    assert.equal(openaiModel(), 'gpt-5-experimental');
  });
  withEnv({ OPENAI_MODEL: '' }, () => {
    assert.equal(openaiModel(), OPENAI_DEFAULT_MODEL);
  });
});

test('anthropicModel resolves call-site override first, then global, then default', () => {
  withEnv(
    {
      ANTHROPIC_DEFAULT_MODEL_OVERRIDE: undefined,
      ANTHROPIC_NARRATIVE_MODEL: undefined
    },
    () => {
      assert.equal(anthropicModel('ANTHROPIC_NARRATIVE_MODEL'), ANTHROPIC_DEFAULT_MODEL);
    }
  );

  withEnv(
    {
      ANTHROPIC_DEFAULT_MODEL_OVERRIDE: 'claude-sonnet-4-6',
      ANTHROPIC_NARRATIVE_MODEL: undefined
    },
    () => {
      assert.equal(anthropicModel('ANTHROPIC_NARRATIVE_MODEL'), 'claude-sonnet-4-6');
    }
  );

  withEnv(
    {
      ANTHROPIC_DEFAULT_MODEL_OVERRIDE: 'claude-sonnet-4-6',
      ANTHROPIC_NARRATIVE_MODEL: 'claude-haiku-4-5'
    },
    () => {
      assert.equal(anthropicModel('ANTHROPIC_NARRATIVE_MODEL'), 'claude-haiku-4-5');
    }
  );
});

test('anthropicModel without a call-site env returns the default chain', () => {
  withEnv({ ANTHROPIC_DEFAULT_MODEL_OVERRIDE: undefined }, () => {
    assert.equal(anthropicModel(), ANTHROPIC_DEFAULT_MODEL);
  });
  withEnv({ ANTHROPIC_DEFAULT_MODEL_OVERRIDE: 'claude-opus-4-9' }, () => {
    assert.equal(anthropicModel(), 'claude-opus-4-9');
  });
});
