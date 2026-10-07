import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_MARKUP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-markup'],
    summary: 'Control markup capture in an exact materialized client browser page',
    usage:
      'orca browser client-markup --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> --action <start|cancel|status> [--json]',
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
      'action'
    ],
    notes: [
      '--runtime-environment identifies the page environment; global --environment independently selects the viewer runtime. Requires exactly one active client-hosted page with the current materialized placement generations. Start acknowledges the existing capture becoming a drawing session; cancel acknowledges the image being discarded. This receipt does not acknowledge native rendering, clipboard delivery or durable saving. Staged, restored and host-streamed pages are refused.'
    ]
  }
]
