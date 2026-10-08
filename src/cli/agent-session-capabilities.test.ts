import { describe, expect, it } from 'vitest'
import { agentSessionCliCapabilities } from './agent-session-capabilities'

describe('structured session CLI capability negotiation', () => {
  it('advertises structured history and mutation semantics on this domain only', () => {
    expect(agentSessionCliCapabilities('agentSession.send')).toEqual(
      expect.arrayContaining([
        'agent-session.structured.v1',
        'agent-session.queued-messages.v1',
        'agent-session.turn-item.v1'
      ])
    )
    expect(agentSessionCliCapabilities('terminal.send')).toEqual([])
    expect(agentSessionCliCapabilities('aiVault.listSessions')).toContain(
      'agent-session.structured.v1'
    )
    expect(agentSessionCliCapabilities('session.tabs.list')).toContain(
      'agent-session.structured.v1'
    )
  })
})
