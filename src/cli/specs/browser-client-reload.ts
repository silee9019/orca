import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_RELOAD_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-reload'],
    summary: 'Request the original context reload of an exact client-hosted page',
    usage:
      'orca browser client-reload --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --browser-client <client> --browser-host-generation <generation> --page-host-generation <generation> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'browser-client',
      'browser-host-generation',
      'page-host-generation'
    ],
    notes: [
      '--runtime-environment identifies the materialized client page; global --environment independently selects the viewer runtime. Reuses the original context-menu reload callback, including its existing missing-guest recovery request. The receipt confirms helper acceptance and current loading state only; completionObserved remains false. Menu closure, native rendering and OS focus are not acknowledged.'
    ]
  }
]
