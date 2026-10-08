import { randomUUID } from 'node:crypto'
import type { CommandHandler } from '../dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  AgentWorkerRecoveryWatchRequest,
  AgentWorkerRecoveryStreamFrame
} from '../../shared/rpc-contract/agent-worker-recovery-watch-params'
import { readAgentSessionRequest } from './agent-session-request'
import { watchRuntimeJsonEvents } from './runtime-json-event-watch'

export const AGENT_WORKER_RECOVERY_WATCH_HANDLERS: Record<string, CommandHandler> = {
  'agent status watch-recovery': async (ctx) => {
    const { watchMs, paneKeys } = await readAgentSessionRequest(
      ctx,
      AgentWorkerRecoveryWatchRequest
    )
    await watchRuntimeJsonEvents({
      watchMs,
      subscribe: (callbacks, signal) =>
        ctx.client.subscribeAgentWorkerRecovery(
          { paneKeys, subscriptionId: randomUUID() },
          callbacks,
          signal
        ),
      parseFrame: (value) => {
        const parsed = AgentWorkerRecoveryStreamFrame.safeParse(value)
        if (!parsed.success) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The selected host returned an invalid worker recovery event.'
          )
        }
        const frame = parsed.data
        if (frame.type === 'error') {
          throw new RuntimeClientError(
            frame.code,
            'The selected host cannot publish worker recovery events.'
          )
        }
        const invalidScope =
          frame.type === 'ready'
            ? JSON.stringify(frame.paneKeys) !== JSON.stringify(paneKeys)
            : frame.type === 'event'
              ? !paneKeys.includes(frame.recovery.paneKey)
              : false
        if (invalidScope) {
          throw new RuntimeClientError(
            'invalid_runtime_response',
            'The worker recovery event scope changed.'
          )
        }
        return frame
      }
    })
  }
}
