import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_CLEANUP_SCAN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['workspace-cleanup', 'scan-start'],
    summary: 'Start an owned cleanup evidence scan on the desktop runtime',
    usage:
      'orca workspace-cleanup scan-start --params-file <file|-> --confirm workspace-cleanup-scan [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local", worktreeId?, worktreeIds?, skipGitWorktreeIds?, includeAllWorkspaces?, refreshActivity?}. Uses the existing scanner, host routing and folder-workspace policy. One active CLI request per runtime. Returns a requestId without waiting for Git/filesystem work.',
      'worktreeIds has the existing 500-row batch limit. An explicit empty array remains a targeted empty scan. worktreeId takes precedence. The scan is evidence, not removal permission. Does not delete workspaces or update the desktop fleet snapshot.',
      'The desktop controller owns the request; existing scanner services own any SSH execution. Node hosts without the desktop service and old peers fail explicitly. No client fallback. Disconnecting the CLI does not cancel the request.'
    ]
  },
  {
    path: ['workspace-cleanup', 'scan-status'],
    summary: 'Read the state and counters of an owned CLI cleanup scan',
    usage: 'orca workspace-cleanup scan-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local", requestId}. Returns pending, cancel_requested, completed, cancelled or failed and latest counters. Does not expose exception details or candidate contents.',
      'Only the latest CLI request/result is retained. Completed requests expire after 15 minutes and a new scan replaces the previous completed result. Restart/expiration/missing records do not prove an execution host stopped work.'
    ]
  },
  {
    path: ['workspace-cleanup', 'scan-cancel'],
    summary: 'Request cancellation of this CLI cleanup scan',
    usage: 'orca workspace-cleanup scan-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local", requestId}. Aborts only the matching CLI scanner and discards its result. Does not cancel renderer scans or another runtime request.',
      'Pending work remains cancel_requested until its scanner promise settles. Poll status for cancelled; an acknowledgement does not prove filesystem or SSH work already stopped. Cancelling a completed request discards its result.'
    ]
  },
  {
    path: ['workspace-cleanup', 'scan-result'],
    summary: 'Read completed CLI cleanup candidates and errors',
    usage: 'orca workspace-cleanup scan-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local", requestId}. Returns the original completed scanner result, including scannedAt, candidates, host identities, blockers and per-repo errors. Pending/cancelled/failed/expired requests fail explicitly.',
      'Candidates and timestamps are evidence from that scan, not permission to delete. Disconnected SSH rows retain the original blocked/unavailable policy. Existing removal preflight remains required.'
    ]
  }
]
