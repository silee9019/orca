import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_NESTED_SCAN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['project-group', 'desktop-scan-start'],
    summary: 'Start an owned nested repository scan on a selected host',
    usage: 'orca project-group desktop-scan-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",expectedScanHostId:"local"|"ssh:<id>",path,options?:{maxDepth?:4,maxRepos?:100,timeoutMs?:15000}}. Uses the original Desktop scanner, Git markers, ignore rules and host routing. Native local paths and POSIX SSH paths must be absolute. No fallback host or home expansion. Depth1..8, repos1..500 and timeout500..30000; unlimited scans are rejected.',
      'Returns a CLI-owned request ID. Check status/result; acceptance does not mean completion. One CLI slot. Does not create/import repos or register a renderer scanId/cache. New start replaces the previous settled CLI result. Transport timeout does not cancel an accepted scan. Missing Desktop service and old peers fail explicitly.'
    ]
  },
  {
    path: ['project-group', 'desktop-scan-status'],
    summary: 'Read state and actual progress counters of a CLI nested scan',
    usage: 'orca project-group desktop-scan-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Actual scanner callbacks supply repoCount/truncated/timedOut/stopped/durationMs; no fabricated renderer subscription. States pending/cancel_requested/completed/cancelled/failed. executionVerdict remains unverifiable. Terminal records expire after 15 minutes.'
    ]
  },
  {
    path: ['project-group', 'desktop-scan-cancel'],
    summary: 'Request cancellation of only a CLI-owned nested scan',
    usage: 'orca project-group desktop-scan-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Aborts the original scanner signal and discards late results. cancel_requested retains the slot until settlement. Does not cancel renderer scans; renderer cancellation cannot abort CLI work. Original scanner checks cancellation between filesystem reads; this does not prove remote IO or a process exited.'
    ]
  },
  {
    path: ['project-group', 'desktop-scan-result'],
    summary: 'Read a bounded page of completed nested repository discovery',
    usage: 'orca project-group desktop-scan-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId,offset?:0,limit?:100}. Maximum500 repos/1MiB retained, at most500 rows per page. Includes original selectedPathKind/truncated/timedOut/stopped and scan budgets; discovery may be incomplete. SSH provider/authority is rechecked before retaining results. Raw service errors are discarded. Pending/failed/cancelled/replaced/expired results fail explicitly. CLI request IDs cannot be used as renderer completed-scan cache authority; existing imports independently validate their selection.'
    ]
  }
]
