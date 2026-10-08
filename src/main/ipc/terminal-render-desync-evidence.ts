import { app, ipcMain } from 'electron'
import type { WriteTerminalRenderDesyncEvidenceArgs } from '../../shared/terminal-render-desync-evidence'
import { queueTerminalRenderDesyncEvidence } from '../terminal-render-desync-evidence-store'
import { isTrustedUIRenderer } from './ui'
export { writeTerminalRenderDesyncEvidence } from '../terminal-render-desync-evidence-store'

export function registerTerminalRenderDesyncEvidenceHandler(): void {
  ipcMain.handle(
    'terminal:writeRenderDesyncEvidence',
    (event, args: WriteTerminalRenderDesyncEvidenceArgs) => {
      if (!isTrustedUIRenderer(event.sender)) {
        throw new Error('Unauthorized render-desync evidence sender')
      }
      return queueTerminalRenderDesyncEvidence(app.getPath('userData'), args)
    }
  )
}
