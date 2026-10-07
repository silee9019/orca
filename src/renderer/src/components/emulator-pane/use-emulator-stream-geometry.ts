import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  resolveVisualStreamGeometry,
  type EmulatorDeviceVisualOrientation,
  type StreamSize
} from './emulator-device-frame-layout'
export function useEmulatorStreamGeometry(
  previewUrl: string | undefined,
  streamKey: string | undefined,
  visualOrientation: EmulatorDeviceVisualOrientation
) {
  const [streamError, setStreamError] = useState(false)
  const [streamSize, setStreamSize] = useState<StreamSize | null>(null)
  const visualStreamGeometry = useMemo(
    () => resolveVisualStreamGeometry(streamSize, visualOrientation),
    [streamSize, visualOrientation]
  )
  useEffect(() => {
    setStreamError(false)
    setStreamSize(null)
  }, [previewUrl, streamKey])
  const handleStreamSize = useCallback((size: NonNullable<StreamSize>) => {
    setStreamError(false)
    setStreamSize((current) =>
      current?.width === size.width && current.height === size.height ? current : size
    )
  }, [])
  const handleStreamError = useCallback(() => {
    setStreamError(true)
  }, [])
  return { streamError, streamSize, visualStreamGeometry, handleStreamSize, handleStreamError }
}
