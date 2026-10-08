import { useCallback, useRef } from 'react'
import type { PendingRemoteBrowserWheel } from './remote-browser-page-input-model'

export function useRemoteBrowserPageInputQueue(): {
  enqueueRemoteInput: (operation: () => Promise<void>) => Promise<void>
  clearPendingRemoteWheel: () => void
  resetRemoteInputQueue: () => void
  pendingRemoteWheelRef: React.MutableRefObject<PendingRemoteBrowserWheel | null>
  remoteWheelFrameRef: React.MutableRefObject<number | null>
  remoteWheelInFlightRef: React.MutableRefObject<boolean>
} {
  const remoteInputQueueRef = useRef<Promise<unknown>>(undefined!)
  remoteInputQueueRef.current ??= Promise.resolve()
  const pendingRemoteWheelRef = useRef<PendingRemoteBrowserWheel | null>(null)
  const remoteWheelFrameRef = useRef<number | null>(null)
  const remoteWheelInFlightRef = useRef(false)

  const enqueueRemoteInput = useCallback((operation: () => Promise<void>): Promise<void> => {
    const next = remoteInputQueueRef.current.catch(() => {}).then(operation)
    remoteInputQueueRef.current = next.catch(() => {})
    return next
  }, [])

  const resetRemoteInputQueue = useCallback((): void => {
    remoteInputQueueRef.current = Promise.resolve()
  }, [])

  const clearPendingRemoteWheel = useCallback((): void => {
    pendingRemoteWheelRef.current = null
    remoteWheelInFlightRef.current = false
    if (remoteWheelFrameRef.current !== null) {
      window.cancelAnimationFrame(remoteWheelFrameRef.current)
      remoteWheelFrameRef.current = null
    }
  }, [])

  return {
    enqueueRemoteInput,
    clearPendingRemoteWheel,
    resetRemoteInputQueue,
    pendingRemoteWheelRef,
    remoteWheelFrameRef,
    remoteWheelInFlightRef
  }
}
