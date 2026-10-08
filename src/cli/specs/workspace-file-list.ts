import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_FILE_LIST_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'desktop-list-start'],
    summary: 'Start an owned Desktop workspace file listing',
    usage: 'orca file desktop-list-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",target:{worktreeId,executionHostId,identityKey}|{worktreeId,executionHostId,instanceId},maxResults?:1000,excludePaths?,candidatePaths?,searchQuery?,nameFilter?,includeIgnored?:false,followSymlinks?:false}. Instance-only targets require folder repositories. Reuses the original Quick Open listing and host capability checks. Only local or explicit SSH workspace hosts are supported; disconnected SSH never falls back to local. Name filtering is local only; query ranking is SSH only. Exclude/candidate paths use the original path validation and capability gates.',
      'Returns a request ID, not a completed listing. Check desktop-list-status/result. One CLI slot; no renderer request identity or caller root path is accepted. A new start replaces the previous settled result. Transport timeout does not cancel a started listing. Missing Desktop service and old peers fail explicitly.'
    ]
  },
  {
    path: ['file', 'desktop-list-status'],
    summary: 'Read one CLI-owned Desktop listing state',
    usage: 'orca file desktop-list-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. States pending/cancel_requested/completed/cancelled/failed. executionVerdict remains unverifiable; completion describes the listing promise, not physical process death. Terminal results expire after 15 minutes. Original service errors are discarded.'
    ]
  },
  {
    path: ['file', 'desktop-list-cancel'],
    summary: 'Abort a CLI-owned Desktop file listing',
    usage: 'orca file desktop-list-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Cancels only the matching CLI request, never a renderer request. cancel_requested retains the slot until the original promise settles; late results are discarded. A settled result can be discarded. Cancellation does not prove a ripgrep or remote process exited.'
    ]
  },
  {
    path: ['file', 'desktop-list-result'],
    summary: 'Read a bounded page of a completed Desktop file listing',
    usage: 'orca file desktop-list-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId,offset?:0,limit?:100}. Maximum 500 rows per page. Retains at most 10000 rows/1MiB with truncated flag when received rows exceed the cap. Original host inventory and legacy Quick Open budgets can also limit discovery; this is not an exhaustive filesystem inventory. Pending/failed/cancelled/replaced/expired results fail explicitly. Workspace identity and host are rechecked before retaining results.'
    ]
  }
]
