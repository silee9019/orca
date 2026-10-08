import type { z } from 'zod'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import {
  BrowserClientDocumentViewerCommand,
  BrowserClientDocumentReceipt
} from '../../../shared/rpc-contract/browser-client-document-params'
import { resolveWorkspaceDocAddressTarget } from '@/lib/workspace-doc-address-input'
import { useAppStore } from '@/store'
import {
  isBrowserClientDocumentSourceCurrent,
  type BrowserClientDocumentSource
} from './browser-client-document-source'
import type { BrowserClientDocumentEffectReceipt } from '../../../shared/rpc-contract/browser-client-staged-document-params'
export type BrowserClientDocumentEvent = {
  source: BrowserClientDocumentSource
  value: string
  documentWorktreeId: string
  expiresAt: number
  offer: (perform: () => void) => void
  finish: (error?: Error, receipt?: BrowserClientDocumentEffectReceipt) => void
}
export const BROWSER_CLIENT_DOCUMENT_EVENT = 'orca:browser-client-document-command'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-client-document-command': CustomEvent<BrowserClientDocumentEvent>
  }
}
export async function applyBrowserClientDocumentRequest(
  command: z.infer<typeof BrowserClientDocumentViewerCommand>,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const parsed = BrowserClientDocumentViewerCommand.parse(command)
  const clientDocument = await requestBrowserClientDocumentEffect(
    { kind: 'materialized', target: parsed.target },
    parsed.value,
    parsed.documentWorktreeId ?? parsed.target.worktreeId,
    expiresAt
  )
  return {
    viewer: 'host',
    viewerId: 0,
    applied: true,
    persisted: false,
    rendered: false,
    clientDocument: BrowserClientDocumentReceipt.parse(clientDocument)
  }
}
export async function requestBrowserClientDocumentEffect(
  source: BrowserClientDocumentSource,
  value: string,
  documentWorktreeId: string,
  expiresAt: number
): Promise<BrowserClientDocumentEffectReceipt> {
  if (!isBrowserClientDocumentSourceCurrent(source)) {
    throw new Error('browser_client_document_target_unavailable')
  }
  const resolved = resolveWorkspaceDocAddressTarget(
    useAppStore.getState(),
    source.target.worktreeId,
    value
  )
  if (
    resolved.status !== 'workspace-doc' ||
    resolved.docLocation.worktreeId !== documentWorktreeId
  ) {
    throw new Error('browser_client_document_input_unsupported')
  }
  return await new Promise<BrowserClientDocumentEffectReceipt>((resolve, reject) => {
    let settled = false
    const offers: (() => void)[] = []
    const finish = (error?: Error, receipt?: BrowserClientDocumentEffectReceipt): void => {
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
        reject(new Error('browser_client_document_effect_unknown'))
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('browser_client_document_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_CLIENT_DOCUMENT_EVENT, {
        detail: {
          source,
          value,
          documentWorktreeId,
          expiresAt,
          finish,
          offer: (perform: () => void) => offers.push(perform)
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length !== 1) {
      finish(new Error('browser_client_document_owner_unavailable_or_ambiguous'))
    } else {
      offers[0]?.()
    }
  })
}
