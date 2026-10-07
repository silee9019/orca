import type {
  BrowserMarkupEditorCommand,
  BrowserMarkupEditorState
} from '../../../shared/rpc-contract/browser-markup-editor-params'
export type BrowserMarkupEditorEvent = {
  page: string
  command: BrowserMarkupEditorCommand
  expiresAt: number
  claim: () => boolean
  isSettled: () => boolean
  finish: (error?: Error, state?: BrowserMarkupEditorState) => void
}
export const BROWSER_MARKUP_EDITOR_COMMAND_EVENT = 'orca:browser-markup-editor-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-markup-editor-command': CustomEvent<BrowserMarkupEditorEvent>
  }
}
export function requestBrowserMarkupEditor(
  page: string,
  command: BrowserMarkupEditorCommand,
  expiresAt: number
): Promise<BrowserMarkupEditorState> {
  return new Promise((resolve, reject) => {
    let claimed = false
    let settled = false
    const finish = (error?: Error, state?: BrowserMarkupEditorState): void => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (state) {
        resolve(state)
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('markup_editor_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_MARKUP_EDITOR_COMMAND_EVENT, {
        detail: {
          page,
          command,
          expiresAt,
          isSettled: () => settled,
          claim: () => {
            if (claimed) {
              return false
            }
            claimed = true
            return true
          },
          finish
        }
      })
    )
    if (!claimed) {
      finish(new Error('browser_markup_editor_ui_unavailable'))
    }
  })
}
