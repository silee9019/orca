import type {
  BrowserClientPageMetadataParams,
  BrowserClientPageMetadataPublishOutcome
} from '../../../../shared/browser-client-page-metadata-protocol'
import type { RuntimeBrowserClientPlacement } from '../../../../shared/runtime-browser-placement'

export type BrowserClientPageMetadataSnapshot = Pick<
  BrowserClientPageMetadataParams,
  'url' | 'title' | 'loading' | 'canGoBack' | 'canGoForward'
>

/**
 * Hands the params to whatever can reach the runtime's browser-host lease. That is main, not this
 * renderer: the runtime only accepts page traffic on the lease's own connection.
 */
type BrowserClientPageMetadataPublish = (
  params: BrowserClientPageMetadataParams
) => Promise<BrowserClientPageMetadataPublishOutcome>

/**
 * Why a publish that did not land is surfaced: a metadata publish is the only thing that moves the
 * runtime's copy of a client-hosted page off the URL it was created with, and a silent failure here
 * reads downstream as a page that simply never navigated.
 */
export type BrowserClientPageMetadataUnpublished =
  /** Delivered, but the runtime declined it — usually a revision it has already passed. */
  { reason: 'rejected' } | { reason: 'failed'; errorCode: string }

export type BrowserClientPageMetadataAcknowledgment = (revision: number | null) => void
type PendingMetadata = {
  snapshot: BrowserClientPageMetadataSnapshot
  acknowledge: BrowserClientPageMetadataAcknowledgment | undefined
}
function acknowledgeMetadata(entry: PendingMetadata | null, revision: number | null): void {
  const callback = entry?.acknowledge
  if (entry) {
    entry.acknowledge = undefined
  }
  callback?.(revision)
}

export function createBrowserClientPageMetadataPublisher(options: {
  browserPageId: string
  placement: RuntimeBrowserClientPlacement
  nextRevision: () => number
  publish: BrowserClientPageMetadataPublish
  onUnpublished?: (detail: BrowserClientPageMetadataUnpublished) => void
}): {
  publish(
    snapshot: BrowserClientPageMetadataSnapshot,
    acknowledge?: BrowserClientPageMetadataAcknowledgment
  ): void
  dispose(): void
} {
  let disposed = false
  let inFlight = false
  let pending: PendingMetadata | null = null
  let active: PendingMetadata | null = null

  const settle = (): void => {
    inFlight = false
    active = null
    if (disposed) {
      pending = null
      return
    }
    const next = pending
    pending = null
    if (next) {
      send(next)
    }
  }

  const send = (entry: PendingMetadata): void => {
    const { snapshot } = entry
    active = entry
    inFlight = true
    let revision: number | null = null
    let request: Promise<BrowserClientPageMetadataPublishOutcome>
    try {
      // Why the revision is minted inside the try: it is drawn from the page's live attachment and
      // throws once that page is detached. Outside, the throw escapes into a webview event handler
      // and leaves this publisher wedged with nothing in flight to release it.
      revision = options.nextRevision()
      request = options.publish({
        browserHostClientId: options.placement.browserHostClientId,
        browserHostGeneration: options.placement.browserHostGeneration,
        browserPageId: options.browserPageId,
        pageHostGeneration: options.placement.pageHostGeneration,
        revision,
        ...snapshot
      })
    } catch (error) {
      request = Promise.reject(error)
    }
    void request
      .then((outcome) => {
        acknowledgeMetadata(
          entry,
          !disposed && outcome.status === 'published' && outcome.accepted === true ? revision : null
        )
        if (outcome.status === 'published') {
          if (!outcome.accepted) {
            options.onUnpublished?.({ reason: 'rejected' })
          }
          return
        }
        options.onUnpublished?.({
          reason: 'failed',
          errorCode:
            outcome.status === 'failed' ? outcome.errorCode : 'browser_client_page_metadata_refused'
        })
      })
      .catch((error: unknown) => {
        acknowledgeMetadata(entry, null)
        options.onUnpublished?.({
          reason: 'failed',
          errorCode: error instanceof Error ? error.message : 'browser_client_page_metadata_failed'
        })
      })
      .finally(settle)
  }

  return {
    publish: (snapshot, acknowledge) => {
      if (disposed) {
        acknowledge?.(null)
        return
      }
      const entry: PendingMetadata = { snapshot: { ...snapshot }, acknowledge }
      if (inFlight) {
        acknowledgeMetadata(pending, null)
        pending = entry
        return
      }
      send(entry)
    },
    dispose: () => {
      disposed = true
      acknowledgeMetadata(active, null)
      acknowledgeMetadata(pending, null)
      pending = null
    }
  }
}
