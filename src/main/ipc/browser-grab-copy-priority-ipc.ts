import { ipcMain } from 'electron'
import { browserManager } from '../browser/browser-manager'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import { probeBrowserGrabCopyShortcutPriority } from '../browser/browser-grab-copy-shortcut-priority'
import {
  BrowserGrabCopyPriorityArgs,
  type BrowserGrabCopyPriority
} from '../../shared/browser-grab-copy-priority'
export function registerBrowserGrabCopyPriorityHandler(): void {
  ipcMain.removeHandler('browser:grabCopyShortcutPriority')
  ipcMain.handle(
    'browser:grabCopyShortcutPriority',
    async (event, input: unknown): Promise<BrowserGrabCopyPriority> => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        throw new Error('browser_copy_priority_not_authorized')
      }
      const args = BrowserGrabCopyPriorityArgs.parse(input)
      const guest = browserManager.getAuthorizedGuest(args.browserPageId, event.sender.id)
      if (!guest || guest.isDestroyed()) {
        throw new Error('browser_copy_priority_guest_not_ready')
      }
      const focused = guest.isFocused()
      const allowed = focused ? await probeBrowserGrabCopyShortcutPriority(guest) : true
      if (
        typeof allowed !== 'boolean' ||
        guest.isDestroyed() ||
        guest.isFocused() !== focused ||
        browserManager.getAuthorizedGuest(args.browserPageId, event.sender.id) !== guest
      ) {
        throw new Error('browser_copy_priority_unverifiable')
      }
      return { allowed, guestFocused: focused, guestId: guest.id }
    }
  )
}
