import type { PtyRendererDelivery } from '../session'
import { getPtyIpc } from '../../pty-host-bindings'
import type { OrcaRuntimeService } from '../../../runtime/orca-runtime'
import { createPtyWriteInput } from './write-input'

import {
  bindHostViewportClaimOwner,
  claimHostViewport,
  writeAfterHostViewportClaim
} from '../runtime/host-viewport-claims'
export { writeAfterHostViewportClaim } from '../runtime/host-viewport-claims'

export function installPtyWriteIpcHandlers(deps: {
  mainWindow?: PtyRendererDelivery
  runtime?: OrcaRuntimeService
}): void {
  const ipcMain = getPtyIpc()
  const { runtime, mainWindow } = deps
  const {
    writePtyInput,
    writePtyInputAccepted,
    isPtyWritePayload,
    isPtyViewportClaimPayload,
    isPtyWriteEventFromMainWindow
  } = createPtyWriteInput(deps)

  bindHostViewportClaimOwner(deps)

  ipcMain.on('pty:write', (event, args: unknown) => {
    if (!isPtyWriteEventFromMainWindow(event) || !isPtyWritePayload(args)) {
      return
    }
    void writeAfterHostViewportClaim(args.id, () => writePtyInput(args))
  })
  ipcMain.handle('pty:writeAccepted', (event, args: unknown): boolean | Promise<boolean> => {
    if (!isPtyWriteEventFromMainWindow(event) || !isPtyWritePayload(args)) {
      return false
    }
    return writeAfterHostViewportClaim(args.id, () => writePtyInputAccepted(args))
  })

  ipcMain.removeAllListeners('pty:claimViewport')
  ipcMain.on('pty:claimViewport', (event, args: unknown) => {
    if (!isPtyWriteEventFromMainWindow(event) || !runtime || !isPtyViewportClaimPayload(args)) {
      return
    }
    if (!mainWindow) {
      return
    }
    void claimHostViewport(runtime, mainWindow.webContents.id, args, undefined, (error) => {
      console.error('[pty] remote desktop host claim failed; gated input will be discarded', error)
    })
  })
}
