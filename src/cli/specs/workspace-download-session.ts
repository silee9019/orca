import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_DOWNLOAD_SESSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'save-downloaded'],
    summary: 'Save downloaded content to a confirmed native destination',
    usage: 'orca file save-downloaded --params-file <file|-> --confirm <destinationPath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input: expectedExecutionHostId (local), expectedWriteHostId (local), destinationPath, content, encoding (utf8 or base64, default utf8), overwrite (default false).',
      'The existing authorized download session owns exclusive staging, destination identity, promotion and cleanup. Active sessions stay busy; symbolic destinations and implicit overwrite are rejected.',
      'Content is accepted only through a JSON file or stdin and is never printed. The single request permits up to 1,048,576 string code units; larger data uses download-session chunks.',
      'Failures include the owned UUID for status/cancel cleanup retries. Cancellation does not remove a finished destination. Old peers fail without fallback.'
    ]
  },
  {
    path: ['file', 'download-session-start'],
    summary: 'Start an owned native file save session',
    usage:
      'orca file download-session-start --params-file <file|-> --confirm <destinationPath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",expectedWriteHostId:"local",destinationPath,overwrite?}. Native absolute destination, original user-file write authorization, separate server UUID and exclusive sibling temporary file. Existing regular destination requires explicit overwrite:true; symbolic links and directories are rejected. Returns pending before admission. Fifteen-minute inactivity requests own cleanup. WSL/SSH, renderer owner and transferId are rejected. No save dialog is opened.'
    ]
  },
  {
    path: ['file', 'download-session-status'],
    summary: 'Read owned file save state and byte offset',
    usage: 'orca file download-session-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. pending/open/finishing/cancel_requested/finished/cancelled/failed. Contains no file content. cleanupPending indicates private staging still needs removal or promotion; failed cleanup retains the slot for exact cancel retry. Settled clean metadata expires after15minutes.'
    ]
  },
  {
    path: ['file', 'download-session-append'],
    summary: 'Append a bounded chunk at an exact owned byte offset',
    usage:
      'orca file download-session-append --params-file <file|-> --confirm <requestId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId,expectedByteOffset,contentBase64}. Bytes must arrive only through stdin/file JSON. One decoded chunk <=1MiB, total<=64MiB. Offset mismatch rejects retries instead of duplicating data. Concurrent append/finish is busy. No bytes are echoed.'
    ]
  },
  {
    path: ['file', 'download-session-finish'],
    summary: 'Close and promote an owned native file save',
    usage:
      'orca file download-session-finish --params-file <file|-> --confirm <requestId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Closes the handle, checks original temp/destination identities, then reuses original sibling promotion/backup rollback. finished only follows successful promotion. Cancellation before promotion discards staging; a cancellation racing an already successful promotion returns finished and never deletes the destination. Original filesystem rename semantics apply.'
    ]
  },
  {
    path: ['file', 'download-session-cancel'],
    summary: 'Cancel only an owned native file save session',
    usage:
      'orca file download-session-cancel --params-file <file|-> --confirm <requestId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Aborts pending admission, waits for own in-flight write, then closes/removes only the original staging inode. Foreign replacement files/symlinks are preserved and cleanupPending stays true. Already finished destinations remain unchanged. Missing service/old peer fails explicitly.'
    ]
  }
]
