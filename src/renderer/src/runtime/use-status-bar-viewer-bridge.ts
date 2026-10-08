import { useEffect } from 'react'
import { attachStatusBarViewerBridge } from './status-bar-viewer-bridge'
export function useStatusBarViewerBridge(): void {
  useEffect(() => attachStatusBarViewerBridge(window.api.ui), [])
}
