import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_NAVIGATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-navigate'],
    summary: 'Navigate an exact client-hosted page and acknowledge its metadata publication',
    usage:
      'orca browser client-navigate --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> --url <url> [--json]',
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
      'url'
    ],
    notes: [
      '--runtime-environment identifies the page; global --environment independently selects the viewer runtime. Requires exactly one active materialized client page. Completion waits for the existing guest navigation promise and an accepted fresh metadata revision. Staged, restored, replaced and unavailable owners are refused. HTTP(S) URLs without embedded credentials only. This receipt does not acknowledge native rendering.'
    ]
  }
]
