import type { z } from 'zod'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import {
  BrowserClientReloadViewerCommand,
  type BrowserClientReloadReceipt
} from '../../../shared/rpc-contract/browser-client-reload-params'
import { isBrowserClientPageViewerTargetCurrent } from './browser-client-page-viewer-target'
export type BrowserClientReloadEvent = {
  target: z.infer<typeof BrowserClientReloadViewerCommand>['target']
  expiresAt: number
  offer: (perform: () => void) => void
  finish: (error?: Error, receipt?: BrowserClientReloadReceipt) => void
}
export const BROWSER_CLIENT_RELOAD_EVENT = 'orca:browser-client-reload-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-client-reload-command': CustomEvent<BrowserClientReloadEvent>
  }
}
export async function applyBrowserClientReloadRequest(
  command: z.infer<typeof BrowserClientReloadViewerCommand>,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const parsed = BrowserClientReloadViewerCommand.parse(command)
  if (!isBrowserClientPageViewerTargetCurrent(parsed.target)) {
    throw new Error('browser_client_reload_target_unavailable')
  }
  const clientReload = await new Promise<BrowserClientReloadReceipt>((resolve, reject) => {
    let settled = false
    const offers: (() => void)[] = []
    const finish = (error?: Error, receipt?: BrowserClientReloadReceipt): void => {
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
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('browser_client_reload_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_CLIENT_RELOAD_EVENT, {
        detail: {
          target: parsed.target,
          expiresAt,
          finish,
          offer: (perform: () => void) => offers.push(perform)
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length !== 1) {
      finish(new Error('browser_client_reload_owner_unavailable_or_ambiguous'))
    } else {
      offers[0]?.()
    }
  })
  return {
    viewer: 'host',
    viewerId: 0,
    applied: true,
    persisted: false,
    rendered: false,
    clientReload
  }
}
