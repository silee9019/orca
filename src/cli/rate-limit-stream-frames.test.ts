import { expect, it } from 'vitest'
import { sanitizeRateLimitStreamFrame } from './rate-limit-stream-frames'
it('retains rate windows and removes identifiers, provider errors and credential metadata', () => {
  const empty = {
    claude: null,
    codex: null,
    gemini: null,
    opencodeGo: null,
    kimi: null,
    minimax: null,
    grok: null,
    antigravity: null,
    cursor: null,
    zcode: null
  }
  const output = sanitizeRateLimitStreamFrame({
    type: 'ready',
    subscriptionId: 'private-connection-id',
    state: {
      ...empty,
      codex: {
        provider: 'codex',
        session: {
          usedPercent: 40,
          windowMinutes: 300,
          resetsAt: null,
          resetDescription: 'private-value'
        },
        weekly: null,
        status: 'error',
        updatedAt: 42,
        error: 'private-value',
        usageMetadata: { credentialSource: 'private-value' }
      },
      inactiveCodexAccounts: [{ accountId: 'private-value' }]
    }
  })
  expect(JSON.stringify(output)).not.toContain('private-')
  expect(output).toMatchObject({
    type: 'ready',
    state: { codex: { session: { usedPercent: 40 } } }
  })
  expect(() =>
    sanitizeRateLimitStreamFrame({ type: 'snapshot', state: { ...empty, codex: { status: 'ok' } } })
  ).toThrow('Invalid rate-limit stream response')
  expect(() =>
    sanitizeRateLimitStreamFrame({ type: 'snapshot', state: empty, token: 'private' })
  ).toThrow('Invalid rate-limit stream response')
})
