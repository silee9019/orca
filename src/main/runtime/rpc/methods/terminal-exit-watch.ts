import { defineStreamingMethod } from '../core'
import { TerminalExitSubscriptionParams } from '../../../../shared/rpc-contract/terminal-exit-watch-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { subscribeTerminalExitStream } from '../../terminal-exit-stream'

export const TERMINAL_EXIT_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.exit.subscribe',
    params: TerminalExitSubscriptionParams,
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
        throw new Error('terminal_exit_owner_changed_or_unverifiable')
      }
      const assertOwner = () => {
        if (
          signal?.aborted ||
          (runtime.getTerminalProcessIncarnation(params.terminal) !== null &&
            runtime.getTerminalProcessIncarnation(params.terminal) !== identity)
        ) {
          throw new Error('terminal_exit_owner_changed_or_unverifiable_or_cancelled')
        }
      }
      assertOwner()
      subscribeTerminalExitStream(params, context, emit, assertOwner)
    }
  })
]
