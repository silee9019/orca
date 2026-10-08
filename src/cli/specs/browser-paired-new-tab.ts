import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_PAIRED_NEW_TAB_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'new-ui-paired'],
    summary: 'Create a paired browser through the current host viewer workspace/group owner',
    usage:
      'orca browser new-ui-paired --viewer host --worktree <id> [--group <id>] --runtime-environment <id> --execution-host runtime:<id> --pairing-revision <revision> --confirm [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'group',
      'runtime-environment',
      'execution-host',
      'pairing-revision',
      'confirm'
    ]
  }
]
