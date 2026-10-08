import { resolveBrowserAddressBarSubmission } from '@/components/browser-pane/navigate/browser-address-bar-navigation'
import { BrowserClientNavigationUrl } from '../../../shared/rpc-contract/browser-client-navigation-params'
import type { z } from 'zod'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import {
  BrowserClientDeferredViewerCommand,
  type BrowserClientDeferredReceipt
} from '../../../shared/rpc-contract/browser-client-deferred-params'
import { resolveWorkspaceDocAddressTarget } from '@/lib/workspace-doc-address-input'
import { useAppStore } from '@/store'
import { isBrowserClientStagedTargetCurrent } from './browser-client-staged-viewer-target'
export type BrowserClientDeferredEvent = {
  target: z.infer<typeof BrowserClientDeferredViewerCommand>['target']
  value: string
  expiresAt: number
  offer: (perform: () => void) => void
  finish: (error?: Error, receipt?: BrowserClientDeferredReceipt) => void
}
export const BROWSER_CLIENT_DEFERRED_EVENT = 'orca:browser-client-deferred-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-client-deferred-command': CustomEvent<BrowserClientDeferredEvent>
  }
}
export async function applyBrowserClientDeferredRequest(
  command: z.infer<typeof BrowserClientDeferredViewerCommand>,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const parsed = BrowserClientDeferredViewerCommand.parse(command)
  if (!isBrowserClientStagedTargetCurrent(parsed.target)) {
    throw new Error('browser_client_deferred_target_unavailable')
  }
  const doc = resolveWorkspaceDocAddressTarget(
    useAppStore.getState(),
    parsed.target.worktreeId,
    parsed.value
  )
  const submission = resolveBrowserAddressBarSubmission(parsed.value, { allowFileUrls: false })
  if (
    doc.status !== 'not-a-workspace-doc' ||
    submission.status !== 'navigate' ||
    !BrowserClientNavigationUrl.safeParse(submission.url).success
  ) {
    throw new Error('browser_client_deferred_web_input_required')
  }
  const clientDeferred = await new Promise<BrowserClientDeferredReceipt>((resolve, reject) => {
    let settled = false
    const offers: (() => void)[] = []
    const finish = (error?: Error, receipt?: BrowserClientDeferredReceipt): void => {
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
        reject(new Error('browser_client_deferred_effect_unknown'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('browser_client_deferred_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_CLIENT_DEFERRED_EVENT, {
        detail: {
          target: parsed.target,
          value: parsed.value,
          expiresAt,
          finish,
          offer: (perform: () => void) => offers.push(perform)
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length !== 1) {
      finish(new Error('browser_client_deferred_owner_unavailable_or_ambiguous'))
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
    clientDeferred
  }
}
