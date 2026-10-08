import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_RELOAD_MENU_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'reload-menu'],
    summary: 'Open or close the native host viewer reload menu with committed state readback',
    usage:
      'orca browser reload-menu --viewer host --page <id> --action <open|close|status> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action']
  }
]
