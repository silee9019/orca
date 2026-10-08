import {
  BrowserClientHistoryDocumentCommand,
  BrowserClientHistoryDocumentReceipt
} from '../../../shared/rpc-contract/browser-client-history-document-params'
import { isBrowserClientDocumentSourceCurrent } from './browser-client-document-source'

export type BrowserClientHistoryDocumentEvent = {
  command: BrowserClientHistoryDocumentCommand
  expiresAt: number
  isSettled: () => boolean
  offer: (perform: () => void) => void
  finish: (error?: Error, receipt?: BrowserClientHistoryDocumentReceipt) => void
}
export const BROWSER_CLIENT_HISTORY_DOCUMENT_EVENT = 'orca:browser-client-history-document'
declare global {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- DOM event map augmentation requires declaration merging.
  interface WindowEventMap {
    'orca:browser-client-history-document': CustomEvent<BrowserClientHistoryDocumentEvent>
  }
}
export async function requestBrowserClientHistoryDocument(
  input: BrowserClientHistoryDocumentCommand,
  expiresAt: number
): Promise<BrowserClientHistoryDocumentReceipt> {
  const command = BrowserClientHistoryDocumentCommand.parse(input)
  if (!isBrowserClientDocumentSourceCurrent(command.source)) {
    throw new Error('browser_client_history_document_target_unavailable')
  }
  return await new Promise((resolve, reject) => {
    const offers: (() => void)[] = []
    let settled = false
    const finish: BrowserClientHistoryDocumentEvent['finish'] = (error, receipt) => {
      if (settled) {
        return
      }
      settled = true
      window.clearTimeout(timer)
      if (error || Date.now() >= expiresAt) {
        reject(error ?? new Error('request_expired'))
      } else {
        const parsed = BrowserClientHistoryDocumentReceipt.safeParse(receipt)
        if (parsed.success) {
          resolve(parsed.data)
        } else {
          reject(new Error('browser_client_history_document_effect_unknown'))
        }
      }
    }
    const timer = window.setTimeout(
      () => finish(new Error('browser_client_history_document_timeout_effect_unknown')),
      Math.max(0, expiresAt - Date.now())
    )
    window.dispatchEvent(
      new CustomEvent(BROWSER_CLIENT_HISTORY_DOCUMENT_EVENT, {
        detail: {
          command,
          expiresAt,
          isSettled: () => settled,
          offer: (perform: () => void) => offers.push(perform),
          finish
        }
      })
    )
    if (Date.now() >= expiresAt) {
      finish(new Error('request_expired'))
    } else if (offers.length !== 1) {
      finish(new Error('browser_client_history_document_owner_unavailable_or_ambiguous'))
    } else {
      offers[0]?.()
    }
  })
}
export async function applyBrowserClientHistoryDocumentRequest(
  command: BrowserClientHistoryDocumentCommand,
  expiresAt: number
) {
  const clientHistoryDocument = await requestBrowserClientHistoryDocument(command, expiresAt)
  return {
    viewer: 'host' as const,
    viewerId: 0,
    applied: true,
    persisted: false as const,
    rendered: false as const,
    clientHistoryDocument
  }
}
