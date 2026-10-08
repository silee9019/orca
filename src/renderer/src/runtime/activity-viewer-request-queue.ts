import type {
  ActivityViewerRequest,
  ActivityViewerResult,
  ActivityViewerResponse
} from '../../../shared/activity-viewer-command'

export type ActivityViewerBridgeApi = {
  onActivityViewerRequest?: (callback: (request: ActivityViewerRequest) => void) => () => void
  respondActivityViewer?: (response: ActivityViewerResponse) => void
}
export function attachActivityViewerRequestQueue(
  api: ActivityViewerBridgeApi,
  applyRequest: (request: ActivityViewerRequest) => Promise<Omit<ActivityViewerResult, 'viewerId'>>
): () => void {
  if (!api.onActivityViewerRequest || !api.respondActivityViewer) {
    return () => {}
  }
  const respond = api.respondActivityViewer
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onActivityViewerRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const result = await applyRequest(request)
        if (!disposed) {
          respond({ id: request.id, ok: true, result: { ...result, viewerId: 0 } })
        }
      } catch (error) {
        if (!disposed) {
          respond({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : 'viewer_operation_failed'
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
