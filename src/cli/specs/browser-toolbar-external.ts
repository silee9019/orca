import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_TOOLBAR_EXTERNAL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'toolbar-external'],
    summary: 'Open the exact mounted native toolbar URL through its existing owner',
    usage:
      'orca browser toolbar-external --viewer host --page <page> --worktree <workspace> --workspace <browser-workspace> --group <group> --execution-host <local|ssh:target> --url <displayed-http-url> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'page',
      'worktree',
      'workspace',
      'group',
      'execution-host',
      'url'
    ]
  }
]
