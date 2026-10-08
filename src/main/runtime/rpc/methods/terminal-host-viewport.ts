import { defineMethod } from '../core'
import { TerminalHostViewportParams } from '../../../../shared/rpc-contract/terminal-host-viewport-params'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import { claimHostViewport } from '../../../ipc/pty/runtime/host-viewport-claims'
import { tryGetProviderForPty } from '../../../ipc/pty/provider/registry'
import { ptyOwnership, ptyIncarnationById } from '../../../ipc/pty/provider/ownership-state'
import { parseExecutionHostId } from '../../../../shared/execution-host'
export const TERMINAL_HOST_VIEWPORT_METHODS = [
  defineMethod({
    name: 'terminal.claimHostViewport',
    params: TerminalHostViewportParams,
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
        throw new Error('terminal_viewport_owner_changed')
      }
      const connectionId = host.kind === 'ssh' ? host.targetId : null,
        matches = () =>
          !signal?.aborted &&
          runtime.getTerminalProcessIncarnation(params.terminal) === identity &&
          !!provider &&
          ptyOwnership.has(target.ptyId) &&
          ptyOwnership.get(target.ptyId) === connectionId &&
          ptyIncarnationById.get(target.ptyId) === params.expectedIncarnationId &&
          tryGetProviderForPty(target.ptyId) === provider
      if (!matches()) {
        throw new Error('terminal_viewport_owner_changed_or_cancelled')
      }
      const requested = { cols: params.cols, rows: params.rows },
        canonicalClaimAccepted = await claimHostViewport(
          runtime,
          params.expectedRendererId,
          { id: target.ptyId, ...requested },
          matches
        )
      if (!matches()) {
        throw new Error('terminal_viewport_owner_changed_or_cancelled')
      }
      return {
        ptyId: target.ptyId,
        executionHostId: target.executionHostId,
        rendererId: params.expectedRendererId,
        requested,
        canonicalClaimAccepted,
        hostResizeEligible:
          canonicalClaimAccepted &&
          runtime.getDriver(target.ptyId).kind !== 'mobile' &&
          !runtime.isRemoteDesktopResizeDriven(target.ptyId),
        rendererApplied: false,
        viewportGeometryVerified: false
      }
    }
  })
]
