import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_GROUP_UI_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'group-ui'],
    summary: 'Create a native browser tab through the mounted group owner or inspect its order',
    usage:
      'orca browser group-ui --viewer host --worktree <id> --group <id> --action <new-browser|status>',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'worktree', 'group', 'action']
  }
]
