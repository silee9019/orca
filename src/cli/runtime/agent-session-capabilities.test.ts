import { describe, expect, it, vi } from 'vitest'
import type { PairingOffer } from '../../shared/pairing'
import {
  sendRemoteRuntimeRequest,
  sendRemoteRuntimeRequestWithStatusPreflight
} from '../../shared/remote-runtime-client'
import { agentSessionCliCapabilities } from '../agent-session-capabilities'
import {
  sendWebSocketRequest,
  sendWebSocketRequestWithStatusPreflight
} from './websocket-transport'

vi.mock('../../shared/remote-runtime-client', () => ({
  RemoteRuntimeClientError: class extends Error {},
  sendRemoteRuntimeRequest: vi.fn().mockResolvedValue({ ok: true }),
  sendRemoteRuntimeRequestWithStatusPreflight: vi.fn().mockResolvedValue({ ok: true })
}))

const pairing: PairingOffer = {
  v: 2,
  endpoint: 'ws://127.0.0.1:1',
  deviceToken: 'fixture',
  publicKeyB64: 'fixture'
}

describe('CLI structured capability forwarding', () => {
  it('negotiates structured tab visibility and journal semantics in both transport paths', async () => {
    await sendWebSocketRequest(pairing, 'session.tabs.list', { worktree: 'folder:fixture' }, 1000)
    expect(sendRemoteRuntimeRequest).toHaveBeenCalledWith(
      pairing,
      'session.tabs.list',
      { worktree: 'folder:fixture' },
      1000,
      undefined,
      undefined,
      agentSessionCliCapabilities('session.tabs.list')
    )
    const validate = vi.fn()
    await sendWebSocketRequestWithStatusPreflight(
      pairing,
      'agentSession.history',
      { sessionId: 'fixture', direction: 'tail' },
      1000,
      validate
    )
    expect(sendRemoteRuntimeRequestWithStatusPreflight).toHaveBeenCalledWith(
      pairing,
      'agentSession.history',
      { sessionId: 'fixture', direction: 'tail' },
      1000,
      validate,
      undefined,
      agentSessionCliCapabilities('agentSession.history')
    )
  })
})
