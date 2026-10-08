import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_GIT_STATUS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['git', 'desktop-status-start'],
    summary: 'Start a CLI-owned Git status read',
    usage: 'orca git desktop-status-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",target,includeIgnored?,includeLineStats?,reuseLineStats?,bypassEffectiveUpstreamNegativeCache?,branchLineTotalMergeBase?}. target requires worktreeId, executionHostId and identityKey (Git) or instanceId (folder). Uses original runtime Git status, host routing/shared links/read lease and own signal. Defaults skip line stats; no new Git command. Native/SSH host validated before and after read. Returns UUID before completion. One slot until own promise settles. Two-minute deadline requests cancellation.'
    ]
  },
  {
    path: ['git', 'desktop-status-status'],
    summary: 'Read an owned Git status request state',
    usage: 'orca git desktop-status-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. pending/completed/cancel_requested/cancelled/failed; executionVerdict is always unverifiable because promise settlement and abort do not prove process exit. Old peer or unavailable service fails explicitly.'
    ]
  },
  {
    path: ['git', 'desktop-status-cancel'],
    summary: 'Cancel only an owned Git status read',
    usage: 'orca git desktop-status-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Aborts only this request signal; original read lease preserves other callers. Renderer requestToken is never accepted. Late/completed results are discarded; cancellation does not claim host process death.'
    ]
  },
  {
    path: ['git', 'desktop-status-result'],
    summary: 'Page a bounded completed Git status result',
    usage: 'orca git desktop-status-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId,offset?,limit?}. limit<=500; status entries and ignoredPaths use the same offset independently. Stored arrays each <=2000 and combined JSON payload <=1MiB, metadata <=64KiB; truncation is explicit. Original didHitLimit/statusLength remain unchanged. Fifteen-minute settled retention; copies prevent result mutation. Cancelled/failed results are unavailable.'
    ]
  }
]
