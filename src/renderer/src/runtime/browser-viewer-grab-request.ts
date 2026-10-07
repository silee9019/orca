import type { BrowserViewerCommand } from '../../../shared/rpc-contract/browser-viewer-params'
import { requestBrowserGrab, type BrowserGrabState } from './browser-grab-request'
import { requestBrowserCopyShortcut } from './browser-copy-shortcut-request'
export async function applyBrowserGrabRequest(
  command: Extract<BrowserViewerCommand, { operation: 'grab' }>,
  expiresAt: number
): Promise<BrowserGrabState> {
  if (command.action === 'shortcut-copy') {
    const grab = await requestBrowserCopyShortcut(command.page, expiresAt)
    return grab
  }
  if (command.action === 'toggle') {
    if (!command.intent) {
      throw new Error('invalid_grab_intent')
    }
    const grab = await requestBrowserGrab(command.page, 'toggle', expiresAt, command.intent)
    return grab
  }
  if (command.action === 'start') {
    if (!command.intent) {
      throw new Error('invalid_grab_intent')
    }
    await requestBrowserGrab(command.page, 'intent-start', expiresAt, command.intent)
  }
  const grab = await requestBrowserGrab(
    command.page,
    command.action === 'start' ? 'await-ready' : command.action,
    expiresAt
  )
  return grab
}
