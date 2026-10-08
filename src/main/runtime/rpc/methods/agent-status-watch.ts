import { defineStreamingMethod } from '../core'
import { AgentStatusSubscriptionParams } from '../../../../shared/rpc-contract/agent-status-watch-params'
import { projectCliAgentStatus } from '../../../../shared/agent-status-cli-row'
import { agentHookServer } from '../../../agent-hooks/server'
import { toAgentStatusIpcPayload } from '../../../agent-hooks/server/server-status-identity'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'

export const AGENT_STATUS_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'agentStatus.subscribe',
    params: AgentStatusSubscriptionParams,
    handler: async (params, context, emit) => {
      const panes = new Set(params.paneKeys),
        connections = new Set(params.connectionIds)
      const stream = createRuntimeJsonEventSubscription(
        context,
        'agentStatus',
        params.subscriptionId,
        emit,
        () => {}
      )
      try {
        stream.register(
          agentHookServer.subscribeEnrichedStatus((row) => {
            if (panes.has(row.paneKey)) {
              stream.event({
                kind: 'set',
                status: projectCliAgentStatus(toAgentStatusIpcPayload(row))
              })
            }
          })
        )
        stream.register(
          agentHookServer.subscribePaneStatusClear((clear) => {
            if (
              'paneKey' in clear ? panes.has(clear.paneKey) : connections.has(clear.connectionId)
            ) {
              stream.event({ kind: 'clear', clear })
            }
          })
        )
        stream.ready({ paneKeys: params.paneKeys, connectionIds: params.connectionIds })
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
