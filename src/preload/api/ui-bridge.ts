import { uiVoiceViewerApi } from './ui-voice-viewer-api'
import { uiSearchSettingsViewerApi } from './ui-search-settings-viewer-api'
import { connectionsViewerUiApi } from './connections-viewer-bridge'
import { crashReportBridgeApi } from './crash-report-bridge'
import { setupGuideBridgeApi } from './setup-guide-bridge'
import { featureTourBridgeApi } from './feature-tour-bridge'
import { activityViewerBridgeApi } from './activity-viewer-bridge'
import { settingsViewerBridgeApi } from './settings-viewer-bridge'
import { sidebarViewerBridgeApi } from './sidebar-viewer-bridge'
import { cardViewerBridgeApi } from './card-viewer-bridge'
import { statusBarViewerBridgeApi } from './status-bar-viewer-bridge'
import { workspaceListViewerBridgeApi } from './workspace-list-viewer-bridge'
import { workspaceFilterBridgeApi } from './workspace-filter-bridge'
import type { PreloadApi } from '../api-types'
import { uiStateAndMenuCommandsApi } from './ui-bridge-state-and-menu-commands'
import { uiTabAndBrowserCommandsApi } from './ui-bridge-tab-and-browser-commands'
import { uiTerminalAndSessionTabsApi } from './ui-bridge-terminal-and-session-tabs'
import { uiClipboardAndWindowControlsApi } from './ui-bridge-clipboard-and-window-controls'

export const uiApi = {
  ...uiVoiceViewerApi,
  ...uiSearchSettingsViewerApi,
  ...connectionsViewerUiApi,
  ...crashReportBridgeApi,
  ...setupGuideBridgeApi,
  ...featureTourBridgeApi,
  ...settingsViewerBridgeApi,
  ...sidebarViewerBridgeApi,
  ...cardViewerBridgeApi,
  ...statusBarViewerBridgeApi,
  ...activityViewerBridgeApi,
  ...workspaceListViewerBridgeApi,
  ...workspaceFilterBridgeApi,
  ...uiStateAndMenuCommandsApi,
  ...uiTabAndBrowserCommandsApi,
  ...uiTerminalAndSessionTabsApi,
  ...uiClipboardAndWindowControlsApi
} satisfies PreloadApi['ui']
