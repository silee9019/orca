import { defineMethod } from '../core'
import { TerminalPtyStopParams } from '../../../../shared/rpc-contract/terminal-pty-stop-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'

export const TERMINAL_PTY_STOP_METHODS = [
  defineMethod({
    name: 'terminal.stopPty',
    params: TerminalPtyStopParams,
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
        throw new Error('terminal_pty_owner_changed')
      }
      const assertOwner = () => {
        if (
          signal?.aborted ||
          runtime.getTerminalProcessIncarnation(params.terminal) !== identity
        ) {
          throw new Error('terminal_pty_owner_changed_or_cancelled')
        }
      }
      assertOwner()
      const receipt = await runtime.stopRendererOwnedTerminalPty(
        target.ptyId,
        {
          expectedIncarnationId: params.expectedIncarnationId,
          expectedExecutionHostId: params.expectedExecutionHostId,
          keepHistory: params.keepHistory
        },
        assertOwner
      )
      return receipt.status === 'exited'
        ? receipt
        : {
            ...receipt,
            ok: false,
            refusal: {
              code: 'terminal_pty_stop_unconfirmed',
              message: 'The stop path settled without execution-host proof of process exit.'
            }
          }
    }
  })
]
