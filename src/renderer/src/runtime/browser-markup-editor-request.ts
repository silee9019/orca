import type { BrowserClientMarkupTarget } from '../../../shared/rpc-contract/browser-client-markup-params'
import type {
  BrowserMarkupEditorCommand,
  BrowserMarkupEditorState
} from '../../../shared/rpc-contract/browser-markup-editor-params'
export type BrowserMarkupEditorOwner = {
  page: string
  active: boolean
  clientTarget?: BrowserClientMarkupTarget
  isCurrent?: () => boolean
}
export type BrowserMarkupEditorEvent = {
  clientTarget?: BrowserClientMarkupTarget
  page: string
  command: BrowserMarkupEditorCommand
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
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
  expiresAt: number,
  clientTarget?: BrowserClientMarkupTarget
): Promise<BrowserMarkupEditorState> {
  return new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let matchingOwners = 0
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
          clientTarget,
          command,
          expiresAt,
          isSettled: () => settled,
          offer: (active: boolean, execute: () => void) => {
            matchingOwners += 1
            if (active) {
              offers.push(execute)
            }
          },
          finish
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length > 1) {
      finish(new Error('browser_markup_editor_owner_ambiguous'))
    } else if (!offers.length) {
      finish(
        new Error(
          matchingOwners ? 'browser_markup_viewer_inactive' : 'browser_markup_editor_ui_unavailable'
        )
      )
    } else {
      offers[0]?.()
    }
  })
}
