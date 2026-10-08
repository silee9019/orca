import { useEffect } from 'react'
import type { EphemeralVmRuntimeRecord } from '../../../../shared/ephemeral-vm-runtimes'
import { attachVmRuntimeViewerRequest } from '@/runtime/vm-runtime-viewer-request'
type Options = {
  active: boolean
  isLoading: boolean
  cleaningId: string | null
  stoppingId: string | null
  runtimes: EphemeralVmRuntimeRecord[]
  pendingStop: EphemeralVmRuntimeRecord | null
  refresh: () => Promise<boolean>
  cleanupRuntime: (runtime: EphemeralVmRuntimeRecord) => Promise<boolean>
  copyCleanupCommand: (runtime: EphemeralVmRuntimeRecord) => Promise<boolean>
  stopCleanup: (runtime: EphemeralVmRuntimeRecord) => Promise<boolean>
}
export function useVmRuntimeViewerRequest({
  active,
  isLoading,
  cleaningId,
  stoppingId,
  runtimes,
  pendingStop,
  refresh,
  cleanupRuntime,
  copyCleanupCommand,
  stopCleanup
}: Options): void {
  useEffect(
    () =>
      attachVmRuntimeViewerRequest(async (request) => {
        if (!active || isLoading || cleaningId !== null || stoppingId !== null) {
          return false
        }
        if (request.action === 'refresh') {
          return refresh()
        }
        const runtime = runtimes.find((value) => value.id === request.runtimeId)
        if (!runtime) {
          return false
        }
        if (request.action === 'cleanup') {
          return cleanupRuntime(runtime)
        }
        if (request.action === 'copy') {
          return copyCleanupCommand(runtime)
        }
        if (request.confirmation !== runtime.id || (pendingStop && pendingStop.id !== runtime.id)) {
          return false
        }
        return stopCleanup(runtime)
      }),
    [
      active,
      isLoading,
      cleaningId,
      stoppingId,
      runtimes,
      pendingStop,
      refresh,
      cleanupRuntime,
      copyCleanupCommand,
      stopCleanup
    ]
  )
}
