import { GLOBAL_FLAGS, type CommandSpec } from '../args'

const providerFlags = [...GLOBAL_FLAGS, 'provider']
const queryFlags = [...providerFlags, 'scope', 'range']

export const USAGE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['usage', 'refresh-account-usage'],
    summary: 'Refresh usage through the mounted provider account section',
    usage: 'orca usage refresh-account-usage --viewer desktop --provider cursor|zcode [--json]',
    allowedFlags: [...providerFlags, 'viewer']
  },
  {
    path: ['usage', 'roster-signin'],
    summary: 'Run the mounted roster provider sign-in navigation',
    usage: 'orca usage roster-signin --viewer desktop --provider <provider> [--json]',
    allowedFlags: [...providerFlags, 'viewer']
  },
  {
    path: ['usage', 'inline-signin'],
    summary: 'Start an exact mounted Codex usage row sign-in',
    usage:
      'orca usage inline-signin --viewer desktop --account-id <id> --runtime host|wsl [--wsl-distro <distro>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'account-id', 'runtime', 'wsl-distro']
  },
  {
    path: ['usage', 'inline-signin-status'],
    summary: 'Read the mounted Codex usage sign-in receipt',
    usage: 'orca usage inline-signin-status --viewer desktop --operation-id <uuid> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'operation-id']
  },
  {
    path: ['usage', 'inline-signin-cancel'],
    summary: 'Request cancellation of the exact inline sign-in',
    usage: 'orca usage inline-signin-cancel --viewer desktop --operation-id <uuid> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'operation-id']
  },
  {
    path: ['usage', 'feature-wall-signin'],
    summary: 'Start the mounted feature wall sign-in and return a receipt',
    usage: 'orca usage feature-wall-signin --viewer desktop --provider claude|codex [--json]',
    allowedFlags: [...providerFlags, 'viewer']
  },
  {
    path: ['usage', 'feature-wall-signin-status'],
    summary: 'Read the exact feature wall sign-in receipt',
    usage:
      'orca usage feature-wall-signin-status --viewer desktop --provider claude|codex --operation-id <uuid> [--json]',
    allowedFlags: [...providerFlags, 'viewer', 'operation-id']
  },
  {
    path: ['usage', 'feature-wall-signin-cancel'],
    summary: 'Request cancellation without claiming terminal completion',
    usage:
      'orca usage feature-wall-signin-cancel --viewer desktop --provider claude|codex --operation-id <uuid> [--json]',
    allowedFlags: [...providerFlags, 'viewer', 'operation-id']
  },
  {
    path: ['usage', 'refresh-account-state'],
    summary: 'Run the mounted feature wall account state callback',
    usage: 'orca usage refresh-account-state --viewer desktop [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['usage', 'percentage-settings'],
    summary: 'Dismiss the usage percentage notice and open its exact desktop settings row',
    usage: 'orca usage percentage-settings --viewer desktop [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['usage', 'viewer-set-enabled'],
    summary: 'Change usage tracking through the trusted desktop provider store',
    usage:
      'orca usage viewer-set-enabled --viewer desktop --provider <provider> --enabled true|false [--json]',
    allowedFlags: [...providerFlags, 'viewer', 'enabled']
  },
  {
    path: ['usage', 'viewer-refresh'],
    summary: 'Refresh the trusted desktop provider usage store and read its observed state',
    usage:
      'orca usage viewer-refresh --viewer desktop --provider claude|codex|opencode|muse|overview [--json]',
    allowedFlags: [...providerFlags, 'viewer']
  },
  {
    path: ['usage', 'record-interaction'],
    summary: 'Record usage tracking interaction through the trusted desktop store',
    usage: 'orca usage record-interaction --viewer desktop [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['usage', 'skill-example'],
    summary: 'Open, close or copy an exact mounted skill example in the trusted desktop viewer',
    usage:
      'orca usage skill-example --viewer desktop --skill-command <slash-command> --example-id <id> --operation open|close|copy [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'skill-command', 'example-id', 'operation']
  },
  {
    path: ['usage', 'set-context-open'],
    summary: 'Open or close one native chat context usage card in a trusted desktop viewer',
    usage:
      'orca usage set-context-open --viewer desktop (--session-id <id>|--pty-id <id>) --open true|false [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'session-id', 'pty-id', 'open']
  },
  {
    path: ['usage', 'dismiss-notice'],
    summary: 'Dismiss a usage notice in the trusted desktop viewer',
    usage:
      'orca usage dismiss-notice --viewer desktop --notice empty-usage|percentage-display [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'notice']
  },
  {
    path: ['usage', 'set-menu-open'],
    summary: 'Open or close the trusted desktop usage menu',
    usage:
      'orca usage set-menu-open --viewer desktop --open true|false [--focus-policy restore-trigger|retain-current] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'open', 'focus-policy']
  },
  {
    path: ['usage', 'share'],
    summary: 'Open the selected provider share card, copy its image or open its X composer',
    usage:
      'orca usage share --viewer desktop --provider claude|codex --operation open|copy|x [--json]',
    allowedFlags: [...providerFlags, 'viewer', 'operation']
  },
  {
    path: ['usage', 'select-tab'],
    summary: 'Open usage analytics for one provider in a trusted desktop viewer',
    usage:
      'orca usage select-tab --viewer desktop --tab-id overview|claude|codex|opencode|muse|grok [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'tab-id']
  },
  {
    path: ['usage', 'set-filters'],
    summary: 'Change the selected provider filters in a trusted desktop viewer',
    usage:
      'orca usage set-filters --viewer desktop --provider <provider> [--scope orca|all] [--range 7d|30d|90d|all] [--json]',
    allowedFlags: [...queryFlags, 'viewer']
  },
  {
    path: ['usage', 'set-display-mode'],
    summary: 'Change usage presentation in a trusted desktop viewer',
    usage: 'orca usage set-display-mode --viewer desktop --mode verbose|compact [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'mode']
  },
  {
    path: ['usage', 'scan-state'],
    summary: 'Read usage scan status on the selected Orca host',
    usage: 'orca usage scan-state --provider claude|codex|opencode|muse [--json]',
    allowedFlags: providerFlags
  },
  {
    path: ['usage', 'set-enabled'],
    summary: 'Enable or disable usage scanning on the selected Orca host',
    usage: 'orca usage set-enabled --provider <provider> --enabled true|false [--json]',
    allowedFlags: [...providerFlags, 'enabled']
  },
  {
    path: ['usage', 'refresh'],
    summary: 'Refresh usage records on the selected Orca host',
    usage: 'orca usage refresh --provider <provider> [--force] [--json]',
    allowedFlags: [...providerFlags, 'force']
  },
  {
    path: ['usage', 'snapshot'],
    summary: 'Read usage totals, daily records and recent sessions',
    usage:
      'orca usage snapshot --provider <provider> [--scope orca|all] [--range 7d|30d|90d|all] [--limit <n>] [--json]',
    allowedFlags: [...queryFlags, 'limit']
  },
  {
    path: ['usage', 'summary'],
    summary: 'Read usage totals',
    usage:
      'orca usage summary --provider <provider> [--scope orca|all] [--range 7d|30d|90d|all] [--json]',
    allowedFlags: queryFlags
  },
  {
    path: ['usage', 'daily'],
    summary: 'Read daily usage records',
    usage:
      'orca usage daily --provider <provider> [--scope orca|all] [--range 7d|30d|90d|all] [--json]',
    allowedFlags: queryFlags
  },
  {
    path: ['usage', 'breakdown'],
    summary: 'Read usage grouped by model or project',
    usage:
      'orca usage breakdown --provider <provider> --kind model|project [--scope orca|all] [--range 7d|30d|90d|all] [--json]',
    allowedFlags: [...queryFlags, 'kind']
  },
  {
    path: ['usage', 'sessions'],
    summary: 'Read recent usage sessions',
    usage:
      'orca usage sessions --provider <provider> [--scope orca|all] [--range 7d|30d|90d|all] [--limit <n>] [--json]',
    allowedFlags: [...queryFlags, 'limit']
  }
]

export const RATE_LIMIT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['rate-limit', 'observe-stream'],
    summary: 'Read bounded rate-limit service events as sanitized JSON lines',
    usage: 'orca rate-limit observe-stream [--count <1..1000>] [--timeout-ms <1..60000>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'count', 'timeout-ms'],
    notes: [
      'Subscribes to service updates without forcing refresh. Output omits account identifiers, credentials and provider error text. Closing the reader releases the connection subscription.'
    ]
  },
  {
    path: ['rate-limit', 'get'],
    aliases: [['rate-limit', 'show']],
    summary: 'Read provider rate limits on the selected Orca host',
    usage: 'orca rate-limit get [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['rate-limit', 'refresh'],
    summary: 'Refresh provider rate limits',
    usage: 'orca rate-limit refresh [--provider all|minimax|grok] [--json]',
    allowedFlags: providerFlags
  },
  {
    path: ['rate-limit', 'refresh-target'],
    summary: 'Refresh Claude or Codex rate limits for one host or WSL target',
    usage:
      'orca rate-limit refresh-target --provider claude|codex --runtime host|wsl [--wsl-distro <name>] [--json]',
    allowedFlags: [...providerFlags, 'runtime', 'wsl-distro']
  },
  {
    path: ['rate-limit', 'set-polling-interval'],
    summary: 'Set the provider polling interval in milliseconds',
    usage: 'orca rate-limit set-polling-interval --ms <positive integer> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'ms']
  },
  {
    path: ['rate-limit', 'fetch-inactive'],
    summary: 'Refresh inactive managed account rate limits',
    usage: 'orca rate-limit fetch-inactive --provider claude|codex [--json]',
    allowedFlags: providerFlags
  },
  {
    path: ['rate-limit', 'consume-codex-reset-credit'],
    destructive: true,
    summary: 'Spend a Codex reset credit for an exact account offer',
    usage:
      'orca rate-limit consume-codex-reset-credit --idempotency-key <uuid> --expected-scope <json> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'idempotency-key', 'expected-scope'],
    notes: [
      'Read accounts.list to obtain the current reset offer. Retry a lost response with the same key and exact scope; a changed offer is rejected.'
    ]
  },
  {
    path: ['rate-limit', 'observe'],
    summary: 'Poll bounded provider rate-limit snapshots',
    usage: 'orca rate-limit observe [--count <n>] [--interval-ms <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'count', 'interval-ms'],
    notes: [
      'Polls the selected host without forcing provider refreshes. Defaults to 10 snapshots, one second apart.'
    ]
  }
]
