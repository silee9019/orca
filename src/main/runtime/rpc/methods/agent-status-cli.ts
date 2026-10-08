import { paneCacheKeyMatchesTab } from '../../../agent-hooks/server/server-status-identity'
import { structuredAgentSessionsHeld } from '../../../native-chat/agent-session-wire/structured-agent-session-registry'
import { defineMethod } from '../core'
import { agentHookServer } from '../../../agent-hooks/server'
import {
  clearMigrationUnsupportedPtysForPaneKey,
  clearMigrationUnsupportedPtysByTabPrefix,
  getMigrationUnsupportedPtySnapshot
} from '../../../agent-hooks/migration-unsupported-pty-state'
import {
  AgentStatusDismissParams,
  AgentStatusRetireTabParams,
  AgentStatusQuestionAnsweredParams,
  AgentStatusInterruptParams,
  AgentStatusListParams
} from '../../../../shared/rpc-contract/agent-status-cli-params'

export const AGENT_STATUS_CLI_METHODS = [
  defineMethod({
    name: 'agentStatus.retireTab',
    params: AgentStatusRetireTabParams,
    handler: ({ tabId, observedRows }) => {
      const current = agentHookServer
        .getStatusSnapshot()
        .filter((row) => paneCacheKeyMatchesTab(row.paneKey, tabId))
      const observedByPane = new Map(observedRows.map((row) => [row.paneKey, row]))
      if (
        current.length !== observedRows.length ||
        current.length !== observedByPane.size ||
        !current.every((row) => {
          const observed = observedByPane.get(row.paneKey)
          return (
            observed?.receivedAt === row.receivedAt &&
            observed.stateStartedAt === row.stateStartedAt
          )
        })
      ) {
        throw Object.assign(new Error('The tab status changed; read it again before retiring.'), {
          code: 'agent_status_changed'
        })
      }
      agentHookServer.dropStatusEntriesByTabPrefix(tabId)
      clearMigrationUnsupportedPtysByTabPrefix(tabId)
      return { retired: true }
    }
  }),
  defineMethod({
    name: 'agentStatus.inferInterrupt',
    params: AgentStatusInterruptParams,
    handler: (request) => ({
      inferred: agentHookServer.inferInterrupt({
        ...request,
        baselineAgentType: request.baselineAgentType
      })
    })
  }),
  defineMethod({
    name: 'agentStatus.inferQuestionAnswered',
    params: AgentStatusQuestionAnsweredParams,
    handler: (request) => ({
      inferred: agentHookServer.inferQuestionAnswered({
        ...request,
        baselineAgentType: request.baselineAgentType
      })
    })
  }),
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
