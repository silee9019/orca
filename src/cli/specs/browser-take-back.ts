import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_TAKE_BACK_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'take-back'],
    summary: 'Take a visible native browser page back from its exact mobile driver',
    usage:
      'orca browser take-back --viewer host --page <page> --worktree <workspace> --mobile-client <current-client-id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'worktree', 'mobile-client', 'confirm'],
    notes: [
      'Requires the mounted native Take back owner, its exact current mobile driver, and explicit confirmation. Reuses the existing reclaim service and requires desktop driver read-back. Remote pages, unavailable owners and old peers fail explicitly; completion does not certify native focus or input.'
    ]
  }
]
