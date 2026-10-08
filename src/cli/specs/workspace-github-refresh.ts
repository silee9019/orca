import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_GITHUB_REFRESH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['github', 'refresh-pr-now'],
    summary: 'Refresh a registered repository branch through the desktop coordinator',
    usage: 'orca github refresh-pr-now --params-file <file|-> --confirm <repoId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {repoId,branch,expectedRepoHostId,expectedExecutionHostId:"local"}. The desktop derives the registered path and SSH/WSL settings. Requires a registered Git repository and exact local/SSH host match. Other runtime-host owners require their direct owner route and fail here. Uses the original coordinator with manual reason, rate-limit gates, outcome observer and statistics. No client/host fallback; Node service absence and old peers fail explicitly.',
      'Returns found, no-pr or upstream-error; a successful transport reply is not a successful lookup. CLI diagnostics are redacted while error kind and retry timestamps remain. This branch lookup does not report renderer visibility, infer a worktree HEAD, or supply linked/fallback review hints. It does not create or mutate a pull request. Timeout does not cancel an in-flight request.'
    ]
  },
  {
    path: ['github', 'enqueue-pr-refresh'],
    summary: 'Queue a manual branch refresh in the existing desktop coordinator',
    usage: 'orca github enqueue-pr-refresh --params-file <file|-> --confirm <repoId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {repoId,branch,expectedRepoHostId,expectedExecutionHostId:"local"}. Uses the same registered-repository and host checks as refresh-pr-now. Queued means accepted into the original coalescing/rate-limited queue, not that a fetch completed or a PR exists. No fabricated renderer/window ownership is supplied.',
      'The original desktop owns queue execution and existing trusted-UI events. Use refresh-pr-now to obtain a current lookup outcome; this command does not subscribe to progress, cancel another viewer request, or claim a visible workspace.'
    ]
  }
]
