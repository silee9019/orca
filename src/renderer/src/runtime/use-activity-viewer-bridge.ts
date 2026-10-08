import { useEffect } from 'react'
import { attachActivityViewerBridge } from './activity-viewer-bridge'
export function useActivityViewerBridge(): void {
  useEffect(() => attachActivityViewerBridge(window.api.ui), [])
}
