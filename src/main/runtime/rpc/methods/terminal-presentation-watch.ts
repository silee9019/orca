import { defineStreamingMethod } from '../core'
import { TerminalPresentationSubscriptionParams } from '../../../../shared/rpc-contract/terminal-presentation-watch-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { subscribeTerminalPresentationStream } from '../../terminal-presentation-stream'

export const TERMINAL_PRESENTATION_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.presentation.subscribe',
    params: TerminalPresentationSubscriptionParams,
    handler: async (params, context, emit) => {
      const { runtime, signal } = context
      const identity = runtime.getTerminalProcessIncarnation(params.terminal)
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
        throw new Error('terminal_presentation_owner_changed')
      }
      const assertOwner = () => {
        if (
          signal?.aborted ||
          runtime.getTerminalProcessIncarnation(params.terminal) !== identity ||
          runtime.getPtyLivenessVerdict(target.ptyId)?.status === 'exited'
        ) {
          throw new Error('terminal_presentation_owner_changed_or_cancelled')
        }
      }
      assertOwner()
      subscribeTerminalPresentationStream(params, context, emit, assertOwner)
    }
  })
]
