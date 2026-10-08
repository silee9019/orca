import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_REPO_FOLDER_PICKER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'folder-picker-start'],
    summary: 'Start a folder selection on the selected desktop host',
    usage:
      'orca repo folder-picker-start --params-file <file|-> --confirm repo-folder-picker [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {kind:"folder"|"folders"|"directory", expectedExecutionHostId:"local"}. Reuses the original repo folder, multi-folder or clone-destination directory picker and its owning desktop window. Returns a requestId without waiting for a person. Can open/focus a native OS selection window; that desktop user must select or cancel.',
      'Does not add a repo, create a directory, apply settings or grant file access. Only one CLI repo picker, including icon selection, can remain active. Node hosts without the desktop service and old peers fail explicitly; no client/SSH picker fallback.'
    ]
  },
  {
    path: ['repo', 'folder-picker-status'],
    summary: 'Read a folder picker request state without its selected paths',
    usage: 'orca repo folder-picker-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId,expectedExecutionHostId:"local"}. Reports pending, cancel_requested, completed, cancelled or failed with kind, required human action and selected path count. Does not return paths. Icon requests are outside this request scope.',
      'At most eight terminal repo-picker records are retained for fifteen minutes. Active native selection remains pending until its promise settles. Records do not survive restart. Missing records or a disconnected client do not prove the OS window closed.'
    ]
  },
  {
    path: ['repo', 'folder-picker-cancel'],
    summary: 'Request cancellation and discard a retained folder selection',
    usage: 'orca repo folder-picker-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId,expectedExecutionHostId:"local"}. Does not close the OS picker. Pending work becomes cancel_requested and rejects late selection; the desktop user must close the window. It blocks a new CLI repo picker until the native promise settles, then becomes cancelled.',
      'Cancelling a completed result discards the retained paths. It does not delete or modify the selected directories. Poll status to confirm completion. Cannot cancel an icon request or an original renderer picker.'
    ]
  },
  {
    path: ['repo', 'folder-picker-result'],
    summary: 'Read completed host-owned folder paths',
    usage: 'orca repo folder-picker-result --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId,expectedExecutionHostId:"local"}. Requires a completed retained selection. Returns {kind,paths} from that desktop, with at most 500 paths and 8192 UTF-8 bytes per path. Oversized selection fails without returning a partial list.',
      'These are host-owned paths and are not client paths or filesystem grants. No repo/settings write occurs. Pending, cancelled, failed, expired, wrong-scope and old-peer requests fail explicitly.'
    ]
  }
]
