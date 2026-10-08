import { BrowserWindow } from 'electron'
export type StarNagCliOperations = {
  status: () => { visible: boolean; evaluating: boolean; completed: boolean }
  dismiss: () => void
  later: () => void
  disable: () => void
  complete: () => void
  openWeb: () => void
  star: () => Promise<boolean>
  show: (viewer: BrowserWindow) => boolean
}
let operations: StarNagCliOperations | null = null
export function registerStarNagCliOperations(value: StarNagCliOperations): void {
  operations = {
    ...value,
    dismiss: hideAfter(value.dismiss),
    later: hideAfter(value.later),
    disable: hideAfter(value.disable),
    complete: hideAfter(value.complete)
  }
}
export function getStarNagCliOperations(): StarNagCliOperations {
  if (!operations) {
    throw new Error('Star prompt service is unavailable')
  }
  return operations
}
export function broadcastStarNagHide(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('star-nag:hide')
    }
  }
}

function hideAfter(action: () => void): () => void {
  return () => {
    action()
    broadcastStarNagHide()
  }
}
