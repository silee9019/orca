import { GLOBAL_FLAGS, type CommandSpec } from '../args'
const allowedFlags = [
  ...GLOBAL_FLAGS,
  'viewer',
  'page',
  'worktree',
  'group',
  'host-client',
  'confirm'
]
const notes = [
  'Requires the exact mounted host row and group. Uses its existing selection or local tabClose service and requires read-back. Unavailable owners and old peers fail explicitly.'
]
export const CLIENT_HOSTED_BROWSER_ROW_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'hosted-row', 'activate'],
    summary: 'Activate a paired-client page through its visible host row owner',
    usage:
      'orca browser hosted-row activate --viewer host --page <page> --worktree <workspace> --group <group> --host-client <client-id> --confirm [--json]',
    allowedFlags,
    notes
  },
  {
    path: ['browser', 'hosted-row', 'close'],
    summary: 'Close a paired-client page through its visible host row owner',
    usage:
      'orca browser hosted-row close --viewer host --page <page> --worktree <workspace> --group <group> --host-client <client-id> --confirm [--json]',
    allowedFlags,
    notes
  }
]
