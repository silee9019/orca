import { stopRendererOwnedPty, type PtyKillIpcDeps } from '../ipc/renderer-kill'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { ptyOwnership } from '../provider/ownership-state'
import { ptyIncarnationById } from '../provider/ownership-state'
import { isObservedPtyExitEvidence } from '../provider/liveness'

export type RendererPtyStopOptions = {
  expectedExecutionHostId: string
  expectedIncarnationId: string
  keepHistory: boolean
}
export type RendererPtyStopReceipt = {
  settled: true
  status: 'exited' | 'unverifiable'
}

export async function stopRendererPtyWithEvidence(
  deps: PtyKillIpcDeps,
  id: string,
  options: RendererPtyStopOptions,
  assertOwner: () => void
): Promise<RendererPtyStopReceipt> {
  const host = parseExecutionHostId(options.expectedExecutionHostId)
  if (!host || host.kind === 'runtime') {
    throw new Error('terminal_pty_owner_changed')
  }
  const connectionId = host.kind === 'ssh' ? host.targetId : null
  let exitConfirmed = false
  const assertTarget = () => {
    assertOwner()
    if (!ptyOwnership.has(id) || ptyOwnership.get(id) !== connectionId) {
      throw new Error('terminal_pty_owner_changed')
    }
    if (ptyIncarnationById.get(id) !== options.expectedIncarnationId) {
      throw new Error('terminal_pty_incarnation_changed')
    }
  }
  await stopRendererOwnedPty(
    {
      ...deps,
      shutdownProviderAndDetectExit: async (provider, ptyId, opts) => {
        try {
          exitConfirmed = await deps.shutdownProviderAndDetectExit(provider, ptyId, opts)
          return exitConfirmed
        } catch (error) {
          exitConfirmed = isObservedPtyExitEvidence(error)
          throw error
        }
      }
    },
    { id, keepHistory: options.keepHistory },
    assertTarget
  )
  return { settled: true, status: exitConfirmed ? 'exited' : 'unverifiable' }
}
