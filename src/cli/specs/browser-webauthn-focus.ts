import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_WEBAUTHN_FOCUS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'webauthn', 'dialog-focus'],
    summary: 'Focus the exact first account in the mounted dialog',
    usage:
      'orca browser webauthn dialog-focus --viewer host --request <request> --page <page> --worktree <workspace> --relying-party <site> --credential-file <file> [--runtime-environment <environment> --remote-page <page> --browser-host-client <client> --browser-host-generation <n> --page-host-generation <n>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'request',
      'page',
      'worktree',
      'relying-party',
      'credential-file',
      'runtime-environment',
      'remote-page',
      'browser-host-client',
      'browser-host-generation',
      'page-host-generation'
    ]
  }
]
