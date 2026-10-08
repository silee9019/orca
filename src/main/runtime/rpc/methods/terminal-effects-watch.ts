import { defineStreamingMethod } from '../core'
import { TerminalEffectsSubscriptionParams } from '../../../../shared/rpc-contract/terminal-effects-watch-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { subscribeTerminalEffectsStream } from '../../terminal-effects-stream'

export const TERMINAL_EFFECTS_WATCH_METHODS = [
  defineStreamingMethod({
    name: 'terminal.effects.subscribe',
    params: TerminalEffectsSubscriptionParams,
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
        throw new Error('terminal_effects_owner_changed')
      }
      const assertOwner = () => {
        if (
          signal?.aborted ||
          runtime.getTerminalProcessIncarnation(params.terminal) !== identity ||
          runtime.getPtyLivenessVerdict(target.ptyId)?.status === 'exited'
        ) {
          throw new Error('terminal_effects_owner_changed_or_cancelled')
        }
      }
      assertOwner()
      subscribeTerminalEffectsStream(params, context, emit, assertOwner)
    }
  })
]
