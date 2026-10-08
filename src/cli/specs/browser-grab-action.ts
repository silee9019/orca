import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_GRAB_ACTION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'grab-action'],
    summary: 'Copy the hovered or context-selected element through the active host grab owner',
    usage: 'orca browser grab-action --viewer host --page <id> --key <copy|screenshot> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'key']
  }
]
