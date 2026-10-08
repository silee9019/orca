import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_SUBMISSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-submit'],
    summary: 'Submit a web address or configured search query to an exact client-hosted page',
    usage:
      'orca browser client-submit --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> --value <address-or-query> [--json]',
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
      'value'
    ],
    notes: [
      '--runtime-environment identifies the materialized page; global --environment independently selects the viewer runtime. Uses the current address-bar search resolver and existing navigation/metadata owner. Only HTTP(S) and search navigation without URL credentials are supported. Workspace documents, invalid/file input and staged/deferred pages are refused before guest navigation. The receipt confirms navigation metadata acceptance, not native rendering or OS focus.'
    ]
  }
]
