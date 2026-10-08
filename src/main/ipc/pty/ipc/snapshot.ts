import { getPtyIpc } from '../../pty-host-bindings'
import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { readMainTerminalBufferSnapshot } from '../../../runtime/terminal-main-buffer-snapshot'
import type { PtyPendingDataDrainQueue } from '../../pty-pending-data-drain-queue'
import {
  getPtyRendererDeliveryDebugSnapshot,
  installPowerSignalBreadcrumbs,
  resetPtyRendererDeliveryDebug,
  type PtyRendererDeliveryDebugSnapshot
} from '../delivery/debug'

export function installPtySnapshotIpcHandlers(deps: {
  runtime?: OrcaRuntimeService
  pendingData: PtyPendingDataDrainQueue
}): void {
  const ipcMain = getPtyIpc()
  const { runtime, pendingData } = deps

  ipcMain.handle(
    'pty:getMainBufferSnapshot',
    (_event, args: { id?: unknown; opts?: { scrollbackRows?: unknown } }) =>
      readMainTerminalBufferSnapshot(runtime, pendingData, args)
  )

  // Why: main owns side effects, so this replay restores title state only — never historical bells/completions (no-attention-replay rule, terminal-side-effect-authority.md).
  ipcMain.handle('pty:sideEffectSnapshot', (_event, args: { id: string }) => {
    if (!runtime || typeof args?.id !== 'string' || args.id.length === 0) {
      return null
    }
    return runtime.getTerminalSideEffectSnapshot(args.id)
  })

  installPowerSignalBreadcrumbs()
  ipcMain.handle('pty:getRendererDeliveryDebugSnapshot', (): PtyRendererDeliveryDebugSnapshot => {
    return getPtyRendererDeliveryDebugSnapshot()
  })
  ipcMain.handle('pty:resetRendererDeliveryDebug', (): void => {
    resetPtyRendererDeliveryDebug()
  })
}
