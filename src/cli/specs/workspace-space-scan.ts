import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_SPACE_SCAN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['workspace-space', 'scan-start'],
    summary: 'Start a desktop-owned workspace disk analysis',
    usage:
      'orca workspace-space scan-start --params-file <file|-> --confirm workspace-space-scan [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local"}. Reuses the original fleet analyzer, host routing, concurrency budgets and best-effort snapshot persistence. One execution slot is shared with renderer analysis; an active renderer scan makes CLI start busy and an active CLI scan makes renderer analyze busy. No duplicate disk traversal, alternate host or client fallback.',
      'Start accepts a request ID; completion must be checked with scan-status and scan-result. No deletion, archive or cleanup is performed. Node service absence and old peers fail explicitly. Timeout does not cancel a started scan. A new start replaces the previous CLI result.'
    ]
  },
  {
    path: ['workspace-space', 'scan-status'],
    summary: 'Read counters and state of one CLI workspace space scan',
    usage: 'orca workspace-space scan-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId,expectedExecutionHostId:"local"}. Counts only; no renderer subscription or fabricated viewer. States are pending/cancel_requested/completed/cancelled/failed. One terminal record is retained for 15 minutes; pending work owns its slot until settlement.'
    ]
  },
  {
    path: ['workspace-space', 'scan-cancel'],
    summary: 'Request cancellation of a CLI-owned space scan',
    usage: 'orca workspace-space scan-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId,expectedExecutionHostId:"local"}. Aborts only the matching CLI scan. cancel_requested keeps the execution slot until the original analyzer settles; late analysis is discarded. Cannot cancel renderer work. Renderer cancellation cannot abort CLI work. Cancelling a completed CLI record discards that result, not a new renderer scan.'
    ]
  },
  {
    path: ['workspace-space', 'scan-result'],
    summary: 'Read a page of completed CLI workspace disk analysis',
    usage: 'orca workspace-space scan-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId,repoOffset?:0,worktreeOffset?:0,limit?:100,expectedExecutionHostId:"local"}. Independent offsets and limit1..500; reply includes summary/totals/hasMore flags. Top-level item arrays are omitted with a count; per-host error diagnostics are redacted. Unavailable host rows remain unavailable and do not prove process death. Pending, failed, cancelled, replaced and expired results fail explicitly. Completion does not prove snapshot durability.'
    ]
  }
]
