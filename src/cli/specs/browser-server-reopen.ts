import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_SERVER_REOPEN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'reopen-server'],
    summary: 'Reopen the captured client page as a new server page',
    usage:
      'orca browser reopen-server --viewer host --page <page> --worktree <workspace> --workspace <browser-workspace> --group <group> --execution-host <host> --runtime-environment <environment> --remote-page <remote-page> --browser-host-client <client> --browser-host-generation <generation> --page-host-generation <generation> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'page',
      'worktree',
      'workspace',
      'group',
      'execution-host',
      'runtime-environment',
      'remote-page',
      'browser-host-client',
      'browser-host-generation',
      'page-host-generation'
    ]
  }
]
