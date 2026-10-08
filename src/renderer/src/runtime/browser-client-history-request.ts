import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import {
  BrowserClientHistoryViewerCommand,
  type BrowserClientHistoryReceipt
} from '../../../shared/rpc-contract/browser-client-history-params'
import { isBrowserClientPageViewerTargetCurrent } from './browser-client-page-viewer-target'
export type BrowserClientHistoryEvent = {
  command: BrowserClientHistoryViewerCommand
  expiresAt: number
  offer: (perform: () => void) => void
  finish: (error?: Error, receipt?: BrowserClientHistoryReceipt) => void
}
export const BROWSER_CLIENT_HISTORY_EVENT = 'orca:browser-client-history-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-client-history-command': CustomEvent<BrowserClientHistoryEvent>
  }
}
export async function requestBrowserClientHistory(
  command: BrowserClientHistoryViewerCommand,
  expiresAt: number
): Promise<BrowserClientHistoryReceipt> {
  const parsed = BrowserClientHistoryViewerCommand.parse(command)
  if (!isBrowserClientPageViewerTargetCurrent(parsed.target)) {
    throw new Error('browser_client_history_target_unavailable')
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const offers: (() => void)[] = []
    const finish = (error?: Error, receipt?: BrowserClientHistoryReceipt): void => {
      if (settled) {
        return
      }
      if (!error && Date.now() >= expiresAt) {
        error = new Error('request_expired')
      }
      settled = true
      window.clearTimeout(timer)
      if (error) {
        reject(error)
      } else if (receipt) {
        resolve(receipt)
      } else {
        reject(new Error('browser_client_history_receipt_missing'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('browser_client_history_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_CLIENT_HISTORY_EVENT, {
        detail: {
          command: parsed,
          expiresAt,
          finish,
          offer: (perform: () => void) => offers.push(perform)
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length !== 1) {
      finish(new Error('browser_client_history_owner_unavailable_or_ambiguous'))
    } else {
      offers[0]?.()
    }
  })
}

export async function applyBrowserClientHistoryRequest(
  command: BrowserClientHistoryViewerCommand,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const clientHistory = await requestBrowserClientHistory(command, expiresAt)
  return {
    viewer: 'host',
    viewerId: 0,
    applied: true,
    persisted: false,
    rendered: false,
    clientHistory
  }
}
