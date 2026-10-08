import type { OrcaRuntimeService } from './orca-runtime'
import type { RpcContext } from './rpc/core'
import type { TerminalPresentationSubscriptionParams } from '../../shared/rpc-contract/terminal-presentation-watch-params'
import {
  createRuntimeJsonEventSubscription,
  getActiveRuntimeJsonEventStreamCount
} from './runtime-json-event-subscription'

export function getActiveTerminalPresentationStreamCount(runtime: OrcaRuntimeService): number {
  return getActiveRuntimeJsonEventStreamCount(runtime, 'terminalPresentation')
}
export function subscribeTerminalPresentationStream(
  params: TerminalPresentationSubscriptionParams,
  context: RpcContext,
  emit: (event: unknown) => void,
  assertOwner: () => void
): void {
  const stream = createRuntimeJsonEventSubscription(
    context,
    'terminalPresentation',
    params.subscriptionId,
    emit,
    assertOwner
  )
  const event = (value: unknown) => stream.event({ kind: params.kind, value })
  try {
    stream.register(
      params.kind === 'driver'
        ? context.runtime.subscribeToDriverChanges(params.expectedPtyId, event)
        : context.runtime.subscribeToFitOverrideChanges(params.expectedPtyId, event)
    )
    stream.register(context.runtime.subscribeToPtyExit(params.expectedPtyId, stream.close))
    stream.ready({ kind: params.kind })
  } catch (error) {
    stream.close()
    throw error
  }
}
