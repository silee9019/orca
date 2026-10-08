import type { RpcContext } from '../core'
import { defineStreamingMethod } from '../core'
import {
  TerminalControlSubscriptionParams,
  TerminalControlRequestSignal
} from '../../../../shared/rpc-contract/terminal-control-watch-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'
import { subscribePtyControlRequests } from '../../pty-control-request-observers'

async function watchRequests(
  params: TerminalControlSubscriptionParams,
  context: RpcContext,
  emit: (event: unknown) => void,
  modelRestoreOnly: boolean
): Promise<void> {
  const { runtime, signal } = context,
    identity = runtime.getTerminalProcessIncarnation(params.terminal)
  const target = await resolveLiveTerminalDetailsTarget(
    runtime,
    params.terminal,
    params.expectedIncarnationId
  )
  if (
    !identity ||
    target.ptyId !== params.expectedPtyId ||
    target.executionHostId !== params.expectedExecutionHostId
  ) {
    throw new Error('terminal_control_owner_changed')
  }
  const assertOwner = () => {
    if (
      signal?.aborted ||
      runtime.getTerminalProcessIncarnation(params.terminal) !== identity ||
      runtime.getPtyLivenessVerdict(target.ptyId)?.status === 'exited'
    ) {
      throw new Error('terminal_control_owner_changed_or_cancelled')
    }
  }
  assertOwner()
  const stream = createRuntimeJsonEventSubscription(
    context,
    'terminalControl',
    params.subscriptionId,
    emit,
    assertOwner
  )
  const fail = () => {
    emit({ type: 'error', code: 'terminal_control_owner_changed_or_cancelled' })
    stream.close()
  }
  try {
    stream.register(
      subscribePtyControlRequests(
        runtime,
        (request) => {
          if (
            !('ptyId' in request) ||
            (request.kind === 'model-restore-needed') !== modelRestoreOnly ||
            request.ptyId !== params.expectedPtyId ||
            request.rendererId !== params.expectedRendererId
          ) {
            return
          }
          const parsed = TerminalControlRequestSignal.safeParse(request)
          if (!parsed.success) {
            fail()
            return
          }
          stream.event({ request: parsed.data, rendererApplied: false })
        },
        fail
      )
    )
    stream.register(runtime.subscribeToPtyExit(params.expectedPtyId, stream.close))
    const { subscriptionId: _subscriptionId, ...scope } = params
    stream.ready(scope)
  } catch (error) {
    stream.close()
    throw error
  }
}
export const TERMINAL_CONTROL_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.controlRequests.subscribe',
    params: TerminalControlSubscriptionParams,
    handler: (params, context, emit) => watchRequests(params, context, emit, false)
  }),
  defineStreamingMethod({
    name: 'terminal.modelRestore.subscribe',
    params: TerminalControlSubscriptionParams,
    handler: (params, context, emit) => watchRequests(params, context, emit, true)
  })
]
