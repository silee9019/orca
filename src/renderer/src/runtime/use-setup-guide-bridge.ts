import { attachHelpModalRequestQueue } from './help-modal-request-queue'
import { useEffect, useRef } from 'react'
import type { SetupGuideRequest, SetupGuideResponse } from '../../../shared/setup-guide-command'
import { applySetupGuideRequest } from './setup-guide-command'
export type SetupGuideBridgeApi = {
  onSetupGuideRequest?: (callback: (request: SetupGuideRequest) => void) => () => void
  respondSetupGuide?: (response: SetupGuideResponse) => void
}
export function attachSetupGuideBridge(
  api: SetupGuideBridgeApi,
  rootAvailable: () => boolean,
  rootGeneration: () => number = () => 0
): () => void {
  return attachHelpModalRequestQueue(
    api.onSetupGuideRequest,
    api.respondSetupGuide,
    applySetupGuideRequest,
    rootAvailable,
    rootGeneration
  )
}

export function useSetupGuideBridge(available: boolean): void {
  const ready = useRef({ available, generation: 0 })
  if (ready.current.available !== available) {
    ready.current = { available, generation: ready.current.generation + 1 }
  }
  useEffect(
    () =>
      attachSetupGuideBridge(
        window.api.ui,
        () => ready.current.available,
        () => ready.current.generation
      ),
    []
  )
}
