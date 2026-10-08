import type { OrcaRuntimeService } from './orca-runtime'
import type { RpcContext } from './rpc/core'
import {
  TerminalEffectsBatch,
  type TerminalEffectsSubscriptionParams
} from '../../shared/rpc-contract/terminal-effects-watch-params'
import {
  createRuntimeJsonEventSubscription,
  getActiveRuntimeJsonEventStreamCount
} from './runtime-json-event-subscription'

export function getActiveTerminalEffectsStreamCount(runtime: OrcaRuntimeService): number {
  return getActiveRuntimeJsonEventStreamCount(runtime, 'terminalEffects')
}
export function subscribeTerminalEffectsStream(
  params: TerminalEffectsSubscriptionParams,
  context: RpcContext,
  emit: (event: unknown) => void,
  assertOwner: () => void
): void {
  const stream = createRuntimeJsonEventSubscription(
    context,
    'terminalEffects',
    params.subscriptionId,
    emit,
    assertOwner
  )
  const fail = () => {
    emit({ type: 'error', code: 'terminal_effects_owner_changed' })
    stream.close()
  }
  try {
    stream.register(
      context.runtime.onClientEvent(
        (event) => {
          if (event.type !== 'terminalSideEffects' || event.batch.ptyId !== params.expectedPtyId) {
            return
          }
          const batch = TerminalEffectsBatch.safeParse(event.batch)
          if (!batch.success) {
            fail()
            return
          }
          stream.event({ batch: batch.data })
        },
        { consumesTerminalSideEffects: true }
      )
    )
    stream.register(context.runtime.subscribeToPtyExit(params.expectedPtyId, stream.close))
    const { subscriptionId: _subscriptionId, ...target } = params
    stream.ready(target)
  } catch (error) {
    stream.close()
    throw error
  }
}
