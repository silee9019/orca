import { TerminalPreviewDataSignal } from '../../../../shared/rpc-contract/terminal-preview-data-watch-params'
import { TerminalRendererReplaySignal } from '../../../../shared/rpc-contract/terminal-renderer-replay-watch-params'
import { TerminalRendererDataSignal } from '../../../../shared/rpc-contract/terminal-renderer-data-watch-params'
import type { RpcContext } from '../core'
import { defineStreamingMethod } from '../core'
import {
  TerminalControlSubscriptionParams,
  TerminalControlRequestSignal
} from '../../../../shared/rpc-contract/terminal-control-watch-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { createRuntimeJsonEventSubscription } from '../../runtime-json-event-subscription'
import { subscribePtyControlRequests } from '../../pty-control-request-observers'

export async function watchTerminalRendererRequests(
  params: TerminalControlSubscriptionParams,
  context: RpcContext,
  emit: (event: unknown) => void,
  mode: 'control' | 'model' | 'data' | 'replay' | 'preview'
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
            !(mode === 'preview'
              ? request.kind === 'preview-data'
              : mode === 'model'
                ? request.kind === 'model-restore-needed'
                : mode === 'replay'
                  ? request.kind === 'renderer-replay'
                  : mode === 'data'
                    ? request.kind === 'renderer-data'
                    : ['clear-buffer', 'reset-input-modes', 'serialize-buffer'].includes(
                        request.kind
                      )) ||
            request.ptyId !== params.expectedPtyId ||
            request.rendererId !== params.expectedRendererId
          ) {
            return
          }
          const parsed = (
            mode === 'preview'
              ? TerminalPreviewDataSignal
              : mode === 'replay'
                ? TerminalRendererReplaySignal
                : mode === 'data'
                  ? TerminalRendererDataSignal
                  : TerminalControlRequestSignal
          ).safeParse(request)
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
    handler: (params, context, emit) =>
      watchTerminalRendererRequests(params, context, emit, 'control')
  }),
  defineStreamingMethod({
    name: 'terminal.modelRestore.subscribe',
    params: TerminalControlSubscriptionParams,
    handler: (params, context, emit) =>
      watchTerminalRendererRequests(params, context, emit, 'model')
  })
]
