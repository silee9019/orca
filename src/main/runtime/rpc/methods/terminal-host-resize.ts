import { defineMethod } from '../core'
import { TerminalHostResizeParams } from '../../../../shared/rpc-contract/terminal-host-resize-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { resizeHostRendererPty } from '../../../ipc/pty/runtime/host-renderer-resize'
import { tryGetProviderForPty } from '../../../ipc/pty/provider/registry'
import { ptyOwnership, ptyIncarnationById } from '../../../ipc/pty/provider/ownership-state'
import { parseExecutionHostId } from '../../../../shared/execution-host'
export const TERMINAL_HOST_RESIZE_METHODS = [
  defineMethod({
    name: 'terminal.resizeHost',
    params: TerminalHostResizeParams,
    handler: async (params, { runtime, signal }) => {
      const identity = runtime.getTerminalProcessIncarnation(params.terminal),
        target = await resolveLiveTerminalDetailsTarget(
          runtime,
          params.terminal,
          params.expectedIncarnationId
        ),
        host = parseExecutionHostId(params.expectedExecutionHostId),
        provider = tryGetProviderForPty(target.ptyId)
      if (
        !identity ||
        target.ptyId !== params.expectedPtyId ||
        target.executionHostId !== params.expectedExecutionHostId ||
        !host ||
        host.kind === 'runtime'
      ) {
        throw new Error('terminal_resize_owner_changed')
      }
      const connectionId = host.kind === 'ssh' ? host.targetId : null,
        assertTarget = () => {
          if (
            signal?.aborted ||
            runtime.getTerminalProcessIncarnation(params.terminal) !== identity ||
            !ptyOwnership.has(target.ptyId) ||
            ptyOwnership.get(target.ptyId) !== connectionId ||
            ptyIncarnationById.get(target.ptyId) !== params.expectedIncarnationId ||
            tryGetProviderForPty(target.ptyId) !== provider
          ) {
            throw new Error('terminal_resize_owner_changed_or_cancelled')
          }
        }
      assertTarget()
      const requested = { cols: params.cols, rows: params.rows },
        status = resizeHostRendererPty(runtime, { id: target.ptyId, ...requested }, assertTarget)
      assertTarget()
      let applied: { cols: number; rows: number } | null = null
      if (status === 'returned' && provider?.getAppliedSize) {
        try {
          applied = await provider.getAppliedSize(target.ptyId)
        } catch {
          /* Unavailable read-back is not applied-size evidence. */
        }
      }
      assertTarget()
      const providerApplied =
        status === 'returned' && applied?.cols === requested.cols && applied.rows === requested.rows
      return {
        ptyId: target.ptyId,
        executionHostId: target.executionHostId,
        requested,
        providerCallReturned: status === 'returned',
        providerApplied,
        rendererApplied: false,
        applied,
        ...(!providerApplied ? { reason: status === 'returned' ? 'unconfirmed' : status } : {})
      }
    }
  })
]
