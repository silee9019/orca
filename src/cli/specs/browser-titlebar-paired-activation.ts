import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_TITLEBAR_PAIRED_ACTIVATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'titlebar-activate-paired'],
    summary: 'Activate an exact paired browser through the mounted host titlebar owner',
    usage:
      'orca browser titlebar-activate-paired --viewer host --worktree <id> --group <id> --workspace <id> --unified-tab <id> --page <id> --remote-page <id> --host-tab <id> --runtime-environment <id> --execution-host runtime:<id> --pairing-revision <revision> --placement <server|client> [--browser-host-client <id> --browser-host-generation <id> --page-host-generation <id>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'group',
      'workspace',
      'unified-tab',
      'page',
      'remote-page',
      'host-tab',
      'runtime-environment',
      'execution-host',
      'pairing-revision',
      'placement',
      'browser-host-client',
      'browser-host-generation',
      'page-host-generation'
    ]
  }
]
