import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import { BrowserClientNavigationUrl } from '../../../shared/rpc-contract/browser-client-navigation-params'
import type {
  BrowserClientNavigationTarget,
  BrowserClientNavigationReceipt
} from '../../../shared/rpc-contract/browser-client-navigation-params'
import { isBrowserClientPageViewerTargetCurrent } from './browser-client-page-viewer-target'
export type BrowserClientNavigationEvent = {
  target: BrowserClientNavigationTarget
  url: string
  expiresAt: number
  offer: (active: boolean, execute: () => void) => void
  isSettled: () => boolean
  finish: (error?: Error, receipt?: BrowserClientNavigationReceipt) => void
}
export const BROWSER_CLIENT_NAVIGATION_EVENT = 'orca:browser-client-navigation-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-client-navigation-command': CustomEvent<BrowserClientNavigationEvent>
  }
}
export function requestBrowserClientNavigation(
  target: BrowserClientNavigationTarget,
  url: string,
  expiresAt: number
): Promise<BrowserClientNavigationReceipt> {
  if (!BrowserClientNavigationUrl.safeParse(url).success) {
    return Promise.reject(new Error('browser_client_navigation_invalid_url'))
  }
  if (!isBrowserClientPageViewerTargetCurrent(target)) {
    return Promise.reject(new Error('browser_client_navigation_target_mismatch'))
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let owners = 0
    const offers: (() => void)[] = []
    const finish = (error?: Error, receipt?: BrowserClientNavigationReceipt): void => {
      if (settled) {
        return
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
      () => finish(new Error('browser_client_navigation_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_CLIENT_NAVIGATION_EVENT, {
        detail: {
          target,
          url,
          expiresAt,
          isSettled: () => settled,
          finish,
          offer: (active, execute) => {
            owners += 1
            if (active) {
              offers.push(execute)
            }
          }
        }
      })
    )
    if (expiresAt <= Date.now()) {
      finish(new Error('browser_client_navigation_expired'))
    } else if (offers.length === 1) {
      offers[0]()
    } else {
      finish(
        new Error(
          offers.length > 1
            ? 'browser_client_navigation_owner_ambiguous'
            : owners
              ? 'browser_client_navigation_inactive'
              : 'browser_client_navigation_unavailable'
        )
      )
    }
  })
}

export async function applyBrowserClientNavigationRequest(
  command: { target: BrowserClientNavigationTarget; url: string },
  expiresAt: number
): Promise<BrowserViewerResult> {
  const clientNavigation = await requestBrowserClientNavigation(
    command.target,
    command.url,
    expiresAt
  )
  return {
    viewer: 'host',
    viewerId: 0,
    persisted: false,
    rendered: false,
    applied: true,
    page: command.target.page,
    clientNavigation
  }
}
