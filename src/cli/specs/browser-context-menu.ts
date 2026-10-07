import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_CONTEXT_MENU_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'context-menu'],
    summary:
      'Use an already open native host viewer context menu; copy verifies clipboard readback',
    usage:
      'orca browser context-menu --viewer host --page <id> --action <status|close|next|previous|first|last|copy-link|copy-page-url|copy-selection|back|forward|reload|open-link-external|open-page-external|open-link|inspect> [--confirm] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action', 'confirm']
  }
]
