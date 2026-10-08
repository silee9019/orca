import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_FILE_SEARCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'desktop-search-start'],
    summary: 'Start an owned content search in an exact Desktop workspace',
    usage: 'orca file desktop-search-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",target:{worktreeId,executionHostId,identityKey}|{worktreeId,executionHostId,instanceId},query,caseSensitive?,wholeWord?,useRegex?,includePattern?,excludePattern?,maxResults?:2000}. Instance-only targets require folder repositories. Reuses runtime searchRuntimeFiles, original authorization, bundled-ripgrep parser and SSH provider.search with AbortSignal. Only local or explicit SSH workspace hosts; no fallback. Query/patterns up to4096characters; results1..2000.',
      'Returns a CLI-owned request ID. Check status/result. One CLI slot; no renderer token/sender/root path is accepted. New start replaces the previous settled result. Transport timeout does not cancel accepted work. Desktop service absence and old peers fail explicitly. Runtime file authorization applies; document-preview grants are not bypassed.'
    ]
  },
  {
    path: ['file', 'desktop-search-status'],
    summary: 'Read state of a CLI-owned content search',
    usage: 'orca file desktop-search-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. States pending/cancel_requested/completed/cancelled/failed. A terminal record expires after15minutes. Raw search errors are discarded. executionVerdict stays unverifiable; completion concerns the search promise.'
    ]
  },
  {
    path: ['file', 'desktop-search-cancel'],
    summary: 'Abort only a CLI-owned content search',
    usage: 'orca file desktop-search-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Propagates AbortSignal through the original runtime/provider search. cancel_requested retains the slot until settlement and late matches are discarded. Does not touch the Desktop sender:root search map. Cancelling a completed request discards its results. Promise cancellation does not prove local or remote processes exited.'
    ]
  },
  {
    path: ['file', 'desktop-search-result'],
    summary: 'Read a bounded page of completed search matches',
    usage: 'orca file desktop-search-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId,offset?:0,limit?:100}. Pages contain at most500files. Retained matches are capped at2000/1MiB; includes totalFiles/totalMatches/sourceTotalMatches/truncated/hasMore. Original parser/timeout budgets can also truncate results. Exact workspace instance/path and SSH provider/authority are rechecked before retention. Pending/failed/cancelled/replaced/expired results fail explicitly.'
    ]
  }
]
