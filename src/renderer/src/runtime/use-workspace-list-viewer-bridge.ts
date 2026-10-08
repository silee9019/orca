import { useEffect } from 'react'
import { attachWorkspaceListViewerBridge } from './workspace-list-viewer-bridge'
export function useWorkspaceListViewerBridge(): void {
  useEffect(() => attachWorkspaceListViewerBridge(window.api.ui), [])
}
