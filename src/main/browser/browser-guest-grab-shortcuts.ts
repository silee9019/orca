import { probeBrowserGrabCopyShortcutPriority } from './browser-grab-copy-shortcut-priority'
import { keybindingMatchesAction, type KeybindingOverrides } from '../../shared/keybindings'
import type { ResolveRenderer } from './browser-guest-renderer-target'

// Why: a focused guest never surfaces Cmd/Ctrl+C to the renderer; forward only when it wouldn't do a normal copy (no editable focus, no selection).
export function setupGrabShortcutForwarding(args: {
  browserTabId: string
  guest: Electron.WebContents
  resolveRenderer: ResolveRenderer
  hasActiveGrabOp: (browserTabId: string) => boolean
  getKeybindings?: () => KeybindingOverrides | undefined
}): () => void {
  const { browserTabId, guest, resolveRenderer, hasActiveGrabOp, getKeybindings } = args
  const handler = (event: Electron.Event, input: Electron.Input): void => {
    if (input.type !== 'keyDown') {
      return
    }
    const bareKey = input.key.toLowerCase()
    if (
      !input.meta &&
      !input.control &&
      !input.alt &&
      !input.shift &&
      (bareKey === 'c' || bareKey === 's') &&
      hasActiveGrabOp(browserTabId)
    ) {
      const renderer = resolveRenderer(browserTabId)
      if (!renderer) {
        return
      }
      // Why: a focused guest swallows bare keys; during an active grab pick, plain C/S are Orca's copy/screenshot, not page typing.
      event.preventDefault()
      renderer.send('browser:grabActionShortcut', { browserPageId: browserTabId, key: bareKey })
      return
    }

    if (
      // Why: the renderer toggles the picker per message, so a held chord would flicker it.
      input.isAutoRepeat ||
      !keybindingMatchesAction('browser.grabElement', input, process.platform, getKeybindings?.())
    ) {
      return
    }

    void probeBrowserGrabCopyShortcutPriority(guest)
      .then((shouldToggle) => {
        if (!shouldToggle) {
          return
        }
        event.preventDefault()
        const renderer = resolveRenderer(browserTabId)
        if (!renderer) {
          return
        }
        renderer.send('browser:grabModeToggle', browserTabId, 'copy')
      })
      .catch(() => {
        // Why: shortcut forwarding is best-effort — guest teardown or a transient executeJavaScript failure must not break normal copy.
      })
  }

  guest.on('before-input-event', handler)
  return () => {
    try {
      guest.off('before-input-event', handler)
    } catch {
      // Why: browser tabs can briefly outlive the guest webContents during teardown, so cleanup is best-effort.
    }
  }
}
