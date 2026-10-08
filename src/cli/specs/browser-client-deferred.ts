import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_CLIENT_DEFERRED_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'client-defer'],
    summary: 'Queue an address submission in an exact staged client page awaiting host adoption',
    usage:
      'orca browser client-defer --viewer host --worktree <workspace> --page <page> --runtime-environment <environment> --remote-page <remote-page> --value <query-or-address> [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'worktree',
      'page',
      'runtime-environment',
      'remote-page',
      'value'
    ],
    notes: [
      '--runtime-environment identifies the staged page; global --environment independently selects the viewer runtime. Requires exactly one live optimistic client owner with no materialized guest or placement. Uses the original address resolver and deferred queue. The queue retains its existing one-minute expiration and last-write-wins behavior. The receipt confirms only this queue write: host placement, later adoption, loading completion, native rendering and OS focus are not observed. Materialized, restored, document, file and credential-bearing targets are refused.'
    ]
  }
]
