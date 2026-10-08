import { applyBrowserViewerRequest } from './browser-viewer-request-actions'
import type { BrowserViewerEventApi } from '../../../shared/browser-viewer-command'
export { applyBrowserViewerRequest } from './browser-viewer-request-actions'

export function attachBrowserViewerBridge(api: BrowserViewerEventApi): () => void {
  if (!api.onBrowserViewerRequest || !api.respondBrowserViewer) {
    return () => {}
  }
  let disposed = false
  let queue = Promise.resolve()
  const unsubscribe = api.onBrowserViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applyBrowserViewerRequest(request)
        if (!disposed) {
          api.respondBrowserViewer?.({ id: request.id, ok: true, result })
        }
      } catch (error) {
        if (!disposed) {
          api.respondBrowserViewer?.({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
    })
  })
  return () => {
    disposed = true
    unsubscribe()
  }
}
