import { defineMethod } from '../core'
import { TerminalPresentationWaitParams } from '../../../../shared/rpc-contract/terminal-presentation-wait-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { waitForTerminalPresentationEvent } from '../../terminal-presentation-event-wait'

export const TERMINAL_PRESENTATION_WAIT_METHODS = (['driver', 'fit'] as const).map((kind) =>
  defineMethod({
    name: kind === 'driver' ? 'terminal.waitDriver' : 'terminal.waitFit',
    params: TerminalPresentationWaitParams,
    handler: async (params, { runtime, signal }) => {
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
      return waitForTerminalPresentationEvent(
        runtime,
        target.ptyId,
        kind,
        params.timeoutMs,
        signal,
        assertOwner
      )
    }
  })
)
