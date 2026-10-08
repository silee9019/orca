import { defineStreamingMethod } from '../core'
import { AgentMigrationSubscriptionParams } from '../../../../shared/rpc-contract/agent-migration-watch-params'
import { subscribeMigrationUnsupportedPtyChanges } from '../../../agent-hooks/migration-unsupported-pty-observers'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'

export const AGENT_MIGRATION_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'agentStatus.migrationSubscribe',
    params: AgentMigrationSubscriptionParams,
    handler: async (params, context, emit) => {
      const ptys = new Set(params.ptyIds)
      const stream = createRuntimeJsonEventSubscription(
        context,
        'agentStatusMigration',
        params.subscriptionId,
        emit,
        () => {}
      )
      try {
        stream.register(
          subscribeMigrationUnsupportedPtyChanges(
            (change) => {
              if (ptys.has(change.type === 'set' ? change.entry.ptyId : change.ptyId)) {
                stream.event({ change })
              }
            },
            () => {
              emit({ type: 'error', code: 'agent_migration_unavailable' })
              stream.close()
            }
          )
        )
        stream.ready({ ptyIds: params.ptyIds })
      } catch (error) {
        stream.close()
        throw error
      }
    }
  })
]
