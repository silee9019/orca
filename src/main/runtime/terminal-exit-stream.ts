import type { OrcaRuntimeService } from './orca-runtime'
import type { RpcContext } from './rpc/core'
import {
  TerminalExitObservation,
  type TerminalExitSubscriptionParams
} from '../../shared/rpc-contract/terminal-exit-watch-params'
import {
  createRuntimeJsonEventSubscription,
  getActiveRuntimeJsonEventStreamCount
} from './runtime-json-event-subscription'

export function getActiveTerminalExitStreamCount(runtime: OrcaRuntimeService): number {
  return getActiveRuntimeJsonEventStreamCount(runtime, 'terminalExit')
}
export function subscribeTerminalExitStream(
  params: TerminalExitSubscriptionParams,
  context: RpcContext,
  emit: (event: unknown) => void,
  assertOwner: () => void
): void {
  const stream = createRuntimeJsonEventSubscription(
    context,
    'terminalExit',
    params.subscriptionId,
    emit,
    assertOwner
  )
  let ready = false
  let pending: ReturnType<typeof TerminalExitObservation.safeParse> | undefined
  const publish = () => {
    if (!pending) {
      return
    }
    if (pending.success) {
      stream.event({ observation: pending.data })
    } else {
      emit({ type: 'error', code: 'terminal_exit_owner_changed_or_unverifiable' })
    }
    stream.close()
  }
  try {
    stream.register(
      context.runtime.subscribeToPtyExit(params.expectedPtyId, () => {
        const metadata = context.runtime.getPtyExitMetadata(
          params.expectedPtyId,
          params.expectedIncarnationId
        )
        const verdict = context.runtime.getPtyLivenessVerdict(params.expectedPtyId) ?? {
          status: 'unverifiable' as const,
          reason: 'The host did not certify process liveness.'
        }
        pending = TerminalExitObservation.safeParse(
          metadata
            ? {
                ...metadata,
                executionHostId: params.expectedExecutionHostId,
                verdict:
                  verdict.status === 'live'
                    ? {
                        ...verdict,
                        ptyIds: verdict.ptyIds.filter((id) => id === params.expectedPtyId)
                      }
                    : verdict
              }
            : null
        )
        if (ready) {
          publish()
        }
      })
    )
    const { subscriptionId: _subscriptionId, ...target } = params
    stream.ready(target)
    ready = true
    publish()
  } catch (error) {
    stream.close()
    throw error
  }
}
