import { defineMethod } from '../core'
import { TerminalSignalParams } from '../../../../shared/rpc-contract/terminal-signal-params'

export const TERMINAL_SIGNAL_METHODS = [
  defineMethod({
    name: 'terminal.signal',
    params: TerminalSignalParams,
    handler: async (params, { runtime }) => {
      const incarnation = runtime.getTerminalProcessIncarnation(params.terminal)
      if (!incarnation) {
        throw new Error('terminal_gone')
      }
      const target = await runtime.showTerminal(params.terminal)
      if (
        !target.ptyId ||
        runtime.getPtyLivenessVerdict(target.ptyId)?.status === 'exited' ||
        incarnation !== runtime.getTerminalProcessIncarnation(params.terminal) ||
        (params.expectedIncarnationId !== undefined &&
          target.incarnationId !== params.expectedIncarnationId)
      ) {
        throw new Error('terminal_gone')
      }
      const accepted = await runtime.sendTerminalSignal(target.ptyId, params.signal)
      return accepted
        ? { accepted: true }
        : {
            ok: false,
            refusal: {
              code: 'terminal_signal_unavailable',
              message: 'The execution provider cannot deliver terminal signals.'
            }
          }
    }
  })
]
