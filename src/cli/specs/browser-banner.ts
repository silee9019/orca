import { GLOBAL_FLAGS, type CommandSpec } from '../args'
const allowedFlags = [...GLOBAL_FLAGS, 'viewer', 'page', 'worktree']
export const BROWSER_BANNER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'banner', 'resource-dismiss'],
    summary: 'Dismiss the current mounted browser resource notice',
    usage:
      'orca browser banner resource-dismiss --viewer host --page <page> --worktree <workspace> [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'banner', 'cancel-grab'],
    summary: 'Clear pending feedback and cancel its existing picker',
    usage:
      'orca browser banner cancel-grab --viewer host --page <page> --worktree <workspace> [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'banner', 'send-menu-open'],
    summary: 'Open the existing annotation banner send menu',
    usage:
      'orca browser banner send-menu-open --viewer host --page <page> --worktree <workspace> [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'banner', 'send-menu-close'],
    summary: 'Close the existing annotation banner send menu',
    usage:
      'orca browser banner send-menu-close --viewer host --page <page> --worktree <workspace> [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'banner', 'status'],
    summary: 'Read public state of the visible mounted browser banners',
    usage: 'orca browser banner status --viewer host --page <page> --worktree <workspace> [--json]',
    allowedFlags
  }
]
