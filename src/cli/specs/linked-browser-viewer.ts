import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const LINKED_BROWSER_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'linked', 'viewer'],
    summary: 'Open an exact issue or review through its mounted workspace hover owner',
    usage:
      'orca browser linked viewer --viewer host --worktree <id> --execution-host <exact-owner> [--runtime-environment <exact-route>] --surface card-identity|card-details|card-title|activity --kind issue|review --number <number> --url <exact-current-url> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'execution-host',
      'runtime-environment',
      'surface',
      'kind',
      'number',
      'url'
    ],
    notes: [
      'Requires the exact hover to be open in the host viewer. The current linked item number and URL must match; arbitrary URLs are refused.',
      'Reuses the existing hover close and workspace browser callback. Completion requires new browser/page/group store read-back; native rendering/focus/SSH/old-peer materialization remains unverified. Returned data omits URL, title and partition.'
    ]
  }
]
