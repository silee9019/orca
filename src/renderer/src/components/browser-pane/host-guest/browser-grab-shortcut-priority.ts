import { browserChromeShortcutOwnsTarget } from '../describe-page/browser-overlay-shortcut-target'
import type { BrowserChromeShortcutScope, GrabIntent } from '../describe-page/browser-page-types'
import { isEditableKeyboardTarget } from './browser-keyboard'
export function browserGrabShortcutOwnsTarget(
  scope: BrowserChromeShortcutScope,
  target: EventTarget | null,
  workspace: string,
  intent: GrabIntent,
  markup: boolean
): boolean {
  return (
    !markup &&
    !isEditableKeyboardTarget(target) &&
    browserChromeShortcutOwnsTarget(scope, target, workspace) &&
    (intent !== 'copy' || window.getSelection()?.isCollapsed !== false)
  )
}
