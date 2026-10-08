import { defineStreamingMethod } from '../core'
import { AgentWorkerRecoverySubscriptionParams } from '../../../../shared/rpc-contract/agent-worker-recovery-watch-params'
import { subscribeLegacyWorkerRecovery } from '../../legacy-worker-recovery-observers'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'

export const AGENT_WORKER_RECOVERY_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'agentStatus.workerRecoverySubscribe',
    params: AgentWorkerRecoverySubscriptionParams,
    handler: async (params, context, emit) => {
      const panes = new Set(params.paneKeys)
      const stream = createRuntimeJsonEventSubscription(
        context,
        'agentWorkerRecovery',
        params.subscriptionId,
        emit,
        () => {}
      )
      try {
        stream.register(
          subscribeLegacyWorkerRecovery(
            context.runtime,
            (recovery) => {
              if (panes.has(recovery.paneKey)) {
                stream.event({ recovery })
              }
            },
            () => {
              emit({ type: 'error', code: 'agent_worker_recovery_unavailable' })
              stream.close()
            }
          )
        )
        stream.ready({ paneKeys: params.paneKeys })
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
