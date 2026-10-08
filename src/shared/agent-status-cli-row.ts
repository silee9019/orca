import type { AgentStatusIpcPayload } from './agent-status-ipc-payload'

export function projectCliAgentStatus(row: AgentStatusIpcPayload) {
  return {
    paneKey: row.paneKey,
    tabId: row.tabId,
    worktreeId: row.worktreeId,
    connectionId: row.connectionId,
    terminalHandle: row.terminalHandle,
    agentType: row.agentType,
    state: row.state,
    mainAgent: row.mainAgent,
    observation: row.observation
      ? {
          authorityId: row.observation.authorityId,
          incarnation: row.observation.incarnation,
          revision: row.observation.revision
        }
      : undefined,
    receivedAt: row.receivedAt,
    evidenceObservedAt: row.evidenceObservedAt,
    stateStartedAt: row.stateStartedAt,
    restoredUnconfirmed: row.restoredUnconfirmed,
    providerSessionOnly: row.providerSessionOnly,
    structuredHost: row.structuredHost
  }
}
