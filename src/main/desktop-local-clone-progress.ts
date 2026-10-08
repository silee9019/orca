import type { BrowserWindow } from 'electron'
import type { DesktopRepositoryCloneControl } from './desktop-repository-clone-control'
export function emitLocalCloneProgress(
  mainWindow: BrowserWindow,
  text: string,
  controls?: DesktopRepositoryCloneControl
): void {
  for (const line of text.split(/[\r\n]+/)) {
    const match = line.match(/^([\w\s]+):\s+(\d+)%/)
    if (match) {
      const progress = { phase: match[1].trim(), percent: Number.parseInt(match[2], 10) }
      if (controls) {
        controls.onProgress(progress)
      } else if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('repos:clone-progress', progress)
      }
    }
  }
}
