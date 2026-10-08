import { useSettingsViewerBridge } from '../runtime/use-settings-viewer-bridge'
import { useSidebarViewerBridge } from '../runtime/use-sidebar-viewer-bridge'
import { useCardViewerBridge } from '../runtime/use-card-viewer-bridge'
import { useStatusBarViewerBridge } from '../runtime/use-status-bar-viewer-bridge'
import { useWorkspaceListViewerBridge } from '../runtime/use-workspace-list-viewer-bridge'
import { useEffect } from 'react'
import { installAppLifetimeIpcEvents } from './ipc-events/app-lifetime-ipc-bridge'

/** Installs the renderer IPC bridge once for the App lifetime. */
export function useIpcEvents(): void {
  useSettingsViewerBridge()
  useSidebarViewerBridge()
  useCardViewerBridge()
  useStatusBarViewerBridge()
  useWorkspaceListViewerBridge()
  useEffect(() => installAppLifetimeIpcEvents(), [])
}
