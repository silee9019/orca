import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_LOG_TAIL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['file', 'log-tail-read'],
    summary: 'Read a bounded byte range from a named native log file',
    usage: 'orca file log-tail-read --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",expectedReadHostId:"local",filePath,fromByteOffset?,expectedIdentity?}. Native absolute regular file and original user-named path authorization required. WSL/SSH/caller sender are rejected. Same original 256KiB range reader, base64 bytes, offset/identity/truncate reset and handle close. No log file is created or rotated.',
      'Decode base64 bytes and preserve UTF-8 decoder state across chunks. Follow nextByteOffset/hasMore; reset:true returns offset0 and the current fileIdentity before new bytes. Missing service/old peers fail explicitly without client path fallback.'
    ]
  },
  {
    path: ['file', 'log-tail-start'],
    summary: 'Watch a named native log with a CLI-owned request',
    usage: 'orca file log-tail-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",expectedReadHostId:"local",filePath}. Returns server requestId before authorization/watch completion. One CLI watch slot; uses the same original native watch factory with separate renderer ownership. Fifteen-minute inactivity closes only this watcher; status/control access renews idle lifetime. Status contains no file content.'
    ]
  },
  {
    path: ['file', 'log-tail-status'],
    summary: 'Read an owned watcher state and latest change cursor',
    usage: 'orca file log-tail-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. States pending/watching/stop_requested/stopped/failed. sequence increments from original watch callbacks and lastEventType coalesces changes; this is not an exhaustive event stream. Read file bytes with log-tail-read. Rename/rotation may require stop/start to attach the new inode. watcherClosed is true only after its native close callback.'
    ]
  },
  {
    path: ['file', 'log-tail-stop'],
    summary: 'Stop only a CLI-owned native log watcher',
    usage: 'orca file log-tail-stop --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {expectedExecutionHostId:"local",requestId}. Cancels pending authorization or closes this exact watcher. Late authorization cannot revive it. stop_requested retains the slot until pending work or native close settles. Renderer subscription IDs and other watchers are never targeted. Settled metadata expires after15minutes; new start replaces it.'
    ]
  }
]
