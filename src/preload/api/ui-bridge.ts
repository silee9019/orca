import { uiVoiceViewerApi } from './ui-voice-viewer-api'
import { uiSearchSettingsViewerApi } from './ui-search-settings-viewer-api'
import type { PreloadApi } from '../api-types'
import { uiStateAndMenuCommandsApi } from './ui-bridge-state-and-menu-commands'
import { uiTabAndBrowserCommandsApi } from './ui-bridge-tab-and-browser-commands'
import { uiTerminalAndSessionTabsApi } from './ui-bridge-terminal-and-session-tabs'
import { uiClipboardAndWindowControlsApi } from './ui-bridge-clipboard-and-window-controls'

export const uiApi = {
  ...uiVoiceViewerApi,
  ...uiSearchSettingsViewerApi,
  ...uiStateAndMenuCommandsApi,
  ...uiTabAndBrowserCommandsApi,
  ...uiTerminalAndSessionTabsApi,
  ...uiClipboardAndWindowControlsApi
} satisfies PreloadApi['ui']
