import { useEffect } from 'react'
import { attachCardViewerBridge } from './card-viewer-bridge'
export function useCardViewerBridge(): void {
  useEffect(() => attachCardViewerBridge(window.api.ui), [])
}
