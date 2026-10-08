import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_HISTORY_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-history'],
    summary: 'Request history on the exact client-hosted guest',
    usage:
      'orca browser client-history --viewer host --action <back|forward> --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'action',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'browser-client',
      'browser-host-generation',
      'page-host-generation'
    ],
    notes: [
      'The receipt acknowledges the original guest history method and observed state only. completionObserved remains false. --runtime-environment identifies the page; global --environment independently selects the viewer runtime.'
    ]
  }
]
