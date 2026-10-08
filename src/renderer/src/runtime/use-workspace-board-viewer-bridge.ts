import { useEffect } from 'react'
import { attachWorkspaceBoardViewerBridge } from './workspace-board-viewer-bridge'
export function useWorkspaceBoardViewerBridge(): void {
  useEffect(() => attachWorkspaceBoardViewerBridge(window.api.ui), [])
}
