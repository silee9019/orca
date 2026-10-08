import { structuredAgentSessionsHeld } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'
import { defineMethod } from '../core'
import { agentHookServer } from '../../../agent-hooks/server'
import {
  clearMigrationUnsupportedPtysForPaneKey,
  getMigrationUnsupportedPtySnapshot
} from '../../../agent-hooks/migration-unsupported-pty-state'
import {
  AgentStatusDismissParams,
  AgentStatusListParams
} from '../../../../shared/rpc-contract/agent-status-cli-params'

export const AGENT_STATUS_CLI_METHODS = [
  defineMethod({
    name: 'agentSession.held',
    params: AgentStatusListParams,
    handler: () => ({ held: structuredAgentSessionsHeld() })
  }),
  defineMethod({
    name: 'agentAwake.status',
    params: AgentStatusListParams,
    handler: (_params, { runtime }) => {
      const status = runtime.getAgentAwakeStatus()
      if (!status) {
        return {
          ok: false,
          refusal: {
            code: 'agent_awake_unavailable',
            message: 'The execution host has no agent awake service.'
          }
        }
      }
      return { status }
    }
  }),
  defineMethod({
    name: 'agentStatus.list',
    params: AgentStatusListParams,
    handler: () =>
      agentHookServer.getStatusSnapshot().map((row) => ({
        paneKey: row.paneKey,
        tabId: row.tabId,
        worktreeId: row.worktreeId,
        connectionId: row.connectionId,
        terminalHandle: row.terminalHandle,
        agentType: row.agentType,
        state: row.state,
        mainAgent: row.mainAgent,
        receivedAt: row.receivedAt,
        evidenceObservedAt: row.evidenceObservedAt,
        stateStartedAt: row.stateStartedAt,
        restoredUnconfirmed: row.restoredUnconfirmed,
        providerSessionOnly: row.providerSessionOnly,
        structuredHost: row.structuredHost
      }))
  }),
  defineMethod({
    name: 'agentStatus.dismiss',
    params: AgentStatusDismissParams,
    handler: (params) => {
      const row = agentHookServer
        .getStatusSnapshot()
        .find((entry) => entry.paneKey === params.paneKey)
      if (
        !row ||
        row.receivedAt !== params.receivedAt ||
        row.stateStartedAt !== params.stateStartedAt ||
        !agentHookServer.dropPersistedStatusEntry(params)
      ) {
        throw Object.assign(
          new Error('The agent status changed; read it again before dismissing.'),
          {
            code: 'agent_status_changed'
          }
        )
      }
      clearMigrationUnsupportedPtysForPaneKey(params.paneKey)
      return { dismissed: true }
    }
  }),
  defineMethod({
    name: 'agentStatus.migration',
    params: AgentStatusListParams,
    handler: () => getMigrationUnsupportedPtySnapshot()
  })
]
