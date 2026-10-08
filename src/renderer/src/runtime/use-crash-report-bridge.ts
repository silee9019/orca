import { attachHelpModalRequestQueue } from './help-modal-request-queue'
import { useEffect, useRef } from 'react'
import type { CrashReportRequest, CrashReportResponse } from '../../../shared/crash-report-command'
import { applyCrashReportRequest } from './crash-report-command'
export type CrashReportBridgeApi = {
  onCrashReportRequest?: (callback: (request: CrashReportRequest) => void) => () => void
  respondCrashReport?: (response: CrashReportResponse) => void
}
export function attachCrashReportBridge(
  api: CrashReportBridgeApi,
  rootAvailable: () => boolean,
  rootGeneration: () => number = () => 0
): () => void {
  return attachHelpModalRequestQueue(
    api.onCrashReportRequest,
    api.respondCrashReport,
    applyCrashReportRequest,
    rootAvailable,
    rootGeneration
  )
}

export function useCrashReportBridge(available: boolean): void {
  const ready = useRef({ available, generation: 0 })
  if (ready.current.available !== available) {
    ready.current = { available, generation: ready.current.generation + 1 }
  }
  useEffect(
    () =>
      attachCrashReportBridge(
        window.api.ui,
        () => ready.current.available,
        () => ready.current.generation
      ),
    []
  )
}
