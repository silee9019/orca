import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  AgentMigrationWatchRequest,
  AgentMigrationStreamFrame
} from '../../shared/rpc-contract/agent-migration-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const AGENT_MIGRATION_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'agent status watch-migration': async (ctx) => {
    const { watchMs, ptyIds } = await readAgentSessionRequest(ctx, AgentMigrationWatchRequest)
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeAgentMigration(
          { ptyIds, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = AgentMigrationStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The selected host returned an invalid migration event.'
          )
        }
        const frame = parsed.data
        if (frame.type === 'error') {
          throw new RuntimeClientError(
            frame.code,
            'The selected host cannot publish migration events.'
          )
        }
        const invalidScope =
          frame.type === 'ready'
            ? JSON.stringify(frame.ptyIds) !== JSON.stringify(ptyIds)
            : frame.type === 'event'
              ? !ptyIds.includes(
                  frame.change.type === 'set' ? frame.change.entry.ptyId : frame.change.ptyId
                )
              : false
        if (invalidScope) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The migration event scope changed.'
          )
        }
        return frame
      }
    })
  }
}
