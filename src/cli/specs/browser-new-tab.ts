import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const BROWSER_NEW_TAB_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'new-ui'],
    summary:
      'Create a browser tab using the host viewer current workspace/group or focused floating panel',
    usage: 'orca browser new-ui --viewer host --worktree <id> [--group <id>] --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'worktree', 'group', 'confirm']
  }
]
