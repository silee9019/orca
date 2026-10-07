import { BROWSER_DOWNLOAD_UI_COMMAND_SPECS } from './browser-download-ui'
import { BROWSER_COPY_SHORTCUT_COMMAND_SPECS } from './browser-copy-shortcut'
import { BROWSER_NEW_TAB_COMMAND_SPECS } from './browser-new-tab'
import { BROWSER_RELOAD_MENU_COMMAND_SPECS } from './browser-reload-menu'
import type { CommandSpec } from '../args'
export const BROWSER_VIEWER_CONTROL_COMMAND_SPECS: CommandSpec[] = [
  ...BROWSER_DOWNLOAD_UI_COMMAND_SPECS,
  ...BROWSER_COPY_SHORTCUT_COMMAND_SPECS,
  ...BROWSER_NEW_TAB_COMMAND_SPECS,
  ...BROWSER_RELOAD_MENU_COMMAND_SPECS
]
