import { defineMethod } from '../core'
import { TerminalPtyInputParams } from '../../../../shared/rpc-contract/terminal-pty-input-params'
import { writeGuardedRendererPtyInput } from '../../../ipc/pty/runtime/renderer-pty-input'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'

export const TERMINAL_PTY_INPUT_METHODS = [false, true].map((acceptedOnly) =>
  defineMethod({
    name: acceptedOnly ? 'terminal.writeInputAccepted' : 'terminal.writeInput',
    params: TerminalPtyInputParams,
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
      const assertTarget = () => {
        if (
          signal?.aborted ||
          runtime.getTerminalProcessIncarnation(params.terminal) !== identity
        ) {
          throw new Error('terminal_pty_owner_changed_or_cancelled')
        }
      }
      assertTarget()
      const accepted = await writeGuardedRendererPtyInput(
        runtime,
        target.ptyId,
        params.data,
        { ...params, acceptedOnly },
        assertTarget
      )
      return accepted
        ? { accepted: acceptedOnly, queued: true, executionConfirmed: false }
        : {
            accepted: false,
            partialInputPossible: true,
            ok: false,
            refusal: {
              code: 'terminal_pty_input_unconfirmed',
              message: 'PTY input was refused or stopped before all chunks were accepted.'
            }
          }
    }
  })
)
