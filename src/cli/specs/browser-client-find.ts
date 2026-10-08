import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_FIND_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-find'],
    summary: 'Control the existing find bar of an exact client-hosted page in its host viewer',
    usage:
      'orca browser client-find --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> --action <status|open|query|next|previous|close> [--query <query>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'browser-client',
      'browser-host-generation',
      'page-host-generation',
      'action',
      'query'
    ],
    notes: [
      '--runtime-environment identifies the materialized client page; global --environment independently selects the viewer runtime. Query/open/close acknowledge existing UI state readback. Next/previous acknowledge the existing guest find request, while counts are its current observed state, not a new completed search. Native rendering and OS focus are not acknowledged.'
    ]
  }
]
