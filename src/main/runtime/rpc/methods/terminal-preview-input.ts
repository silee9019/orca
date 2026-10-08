import { defineMethod } from '../core'
import { TerminalPreviewInputParams } from '../../../../shared/rpc-contract/terminal-preview-input-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'

export const TERMINAL_PREVIEW_INPUT_METHODS = [
  defineMethod({
    name: 'terminal.previewInput',
    params: TerminalPreviewInputParams,
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
        throw new Error('terminal_preview_owner_changed')
      }
      const assertTarget = () => {
        if (
          signal?.aborted ||
          runtime.getTerminalProcessIncarnation(params.terminal) !== identity
        ) {
          throw new Error('terminal_preview_owner_changed_or_cancelled')
        }
      }
      assertTarget()
      const accepted = await runtime.writeTerminalPreviewInput(
        target.ptyId,
        params.data,
        assertTarget
      )
      return accepted
        ? { accepted: true }
        : {
            accepted: false,
            partialInputPossible: true,
            ok: false,
            refusal: {
              code: 'terminal_preview_input_unconfirmed',
              message: 'Preview input was refused or stopped before all chunks were accepted.'
            }
          }
    }
  })
]
