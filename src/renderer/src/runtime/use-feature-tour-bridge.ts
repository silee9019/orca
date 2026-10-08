import { attachHelpModalRequestQueue } from './help-modal-request-queue'
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
  return attachHelpModalRequestQueue(
    api.onFeatureTourRequest,
    api.respondFeatureTour,
    applyFeatureTourRequest,
    rootAvailable,
    rootGeneration
  )
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
