import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_FAILURE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'failure'],
    summary: 'Apply an exact visible local or client-hosted browser failure action',
    usage:
      'orca browser failure --viewer host --page <page> --worktree <workspace> --placement <local|client-hosted> [--runtime-environment <id> --remote-page <id> --browser-host-client <id> --browser-host-generation <n> --page-host-generation <n>] --url <current-displayed-url> --error-code <code> --action <copy-address|open-external|certificate-proceed|retry|try-https> [--challenge <id>] [--confirm] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'remote-page',
      'browser-host-client',
      'browser-host-generation',
      'page-host-generation',
      'page',
      'worktree',
      'placement',
      'runtime-environment',
      'url',
      'error-code',
      'action',
      'challenge',
      'confirm'
    ],
    notes: [
      'Requires one mounted failure owner matching the exact page, current error and placement. Certificate approval requires its current challenge and --confirm. External opening requires an acknowledged desktop API; old peers fail explicitly. Retry acknowledges loading initiation; try-https reuses the visible eligible local HTTPS recovery target and acknowledges its URL/loading transition, not completed navigation.'
    ]
  }
]
