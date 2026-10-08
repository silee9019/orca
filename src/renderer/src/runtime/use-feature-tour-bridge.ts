import { useEffect, useRef } from 'react'
import type { FeatureTourRequest, FeatureTourResponse } from '../../../shared/feature-tour-command'
import { applyFeatureTourRequest } from './feature-tour-command'
export type FeatureTourBridgeApi = {
  onFeatureTourRequest?: (callback: (request: FeatureTourRequest) => void) => () => void
  respondFeatureTour?: (response: FeatureTourResponse) => void
}
export function attachFeatureTourBridge(
  api: FeatureTourBridgeApi,
  rootAvailable: () => boolean,
  rootGeneration: () => number = () => 0
): () => void {
  if (!api.onFeatureTourRequest || !api.respondFeatureTour) {
    return () => {}
  }
  const respond = api.respondFeatureTour
  let queue = Promise.resolve()
  let disposed = false
  const unsubscribe = api.onFeatureTourRequest((request) => {
    queue = queue.then(async () => {
      if (disposed) {
        return
      }
      try {
        const generation = rootGeneration()
        const result = await applyFeatureTourRequest(
          request,
          () => !disposed && rootAvailable() && rootGeneration() === generation
        )
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
export function useFeatureTourBridge(available: boolean): void {
  const ready = useRef({ available, generation: 0 })
  if (ready.current.available !== available) {
    ready.current = { available, generation: ready.current.generation + 1 }
  }
  useEffect(
    () =>
      attachFeatureTourBridge(
        window.api.ui,
        () => ready.current.available,
        () => ready.current.generation
      ),
    []
  )
}
