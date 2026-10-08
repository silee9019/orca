import { GLOBAL_FLAGS, type CommandSpec } from '../args'
const allowedFlags = [
  ...GLOBAL_FLAGS,
  'viewer',
  'page',
  'worktree',
  'workspace',
  'group',
  'execution-host',
  'toast'
]
export const BROWSER_GRAB_TOAST_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'grab-toast', 'status'],
    summary: 'Inspect the retained screenshot toast',
    usage:
      'orca browser grab-toast status --viewer host --page <page> --worktree <workspace> --workspace <browser-workspace> --group <group> --execution-host <host> [--json]',
    allowedFlags
  },
  {
    path: ['browser', 'grab-toast', 'copy'],
    summary: 'Copy the exact retained toast screenshot',
    usage:
      'orca browser grab-toast copy --viewer host --page <page> --worktree <workspace> --workspace <browser-workspace> --group <group> --execution-host <host> --toast <capture> [--json]',
    allowedFlags
  }
]
