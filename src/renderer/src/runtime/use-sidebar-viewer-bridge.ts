import { useEffect } from 'react'
import { attachSidebarViewerBridge } from './sidebar-viewer-bridge'
export function useSidebarViewerBridge(): void {
  useEffect(() => attachSidebarViewerBridge(window.api.ui), [])
}
