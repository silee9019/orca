import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_TAB_UI_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'tab-ui'],
    summary:
      'Use the native workspace tab row and read back group state; pending close/remote effects are refused',
    usage:
      'orca browser tab-ui --viewer host --workspace <id> --worktree <id> --group <id> --unified-tab <id> --action <activate|close|close-others|close-left|close-right|toggle-pin|duplicate|status> [--confirm] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'workspace',
      'worktree',
      'group',
      'unified-tab',
      'action',
      'confirm'
    ]
  }
]
