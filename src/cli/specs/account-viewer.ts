import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ACCOUNT_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account-view', 'configure-usage'],
    summary: 'Record usage setup interaction and open provider account settings',
    usage: 'orca account-view configure-usage --viewer desktop [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['account-view', 'codex-login-link'],
    summary: 'Copy or open the mounted pending Codex sign-in link without printing it',
    usage:
      'orca account-view codex-login-link --viewer desktop --operation copy|open --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'operation', 'confirm']
  },
  {
    path: ['account-view', 'open-bitbucket-docs'],
    summary: 'Open the Bitbucket API token documentation',
    usage: 'orca account-view open-bitbucket-docs --viewer desktop --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm']
  },
  {
    path: ['account-view', 'open-session-log'],
    summary: 'Open a local session log read-only in the exact active workspace',
    usage:
      'orca account-view open-session-log --viewer desktop --workspace <id> --file <path> --execution-host local [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'workspace', 'file', 'execution-host']
  },
  {
    path: ['account-view', 'open-settings'],
    summary: 'Open account settings in the selected host desktop viewer',
    usage:
      'orca account-view open-settings --viewer desktop --pane accounts|orca-account [--provider <provider>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'pane', 'provider']
  },
  {
    path: ['account-view', 'queue-codex-restarts'],
    destructive: true,
    summary: 'Queue the exact Codex panes shown by account restart notices',
    usage:
      'orca account-view queue-codex-restarts --viewer desktop --pty-ids <id,...> --confirm true [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'pty-ids', 'confirm'],
    notes: [
      'Each pane must have a current account restart notice. A queued pane restarts through its existing mounted lifecycle.'
    ]
  }
]
