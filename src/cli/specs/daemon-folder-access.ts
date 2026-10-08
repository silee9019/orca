import { GLOBAL_FLAGS, type CommandSpec } from '../args'
const NOTES = [
  'Native macOS on the selected runtime only; local is relative to that runtime, including paired hosts. Relay SSH daemons and unsupported hosts are refused. Plan hides folder paths and daemon secrets.',
  'Start requires private JSON with runtimeId, executionHostId:local, daemonIdentityDigest, targetDigest from the plan, a fresh operationId UUID, confirm:true and allowOsPrompt:true. It resets the app permission for the observed folder class and can raise the real OS prompt. It never selects a human answer. Replaying a retained operation does not reset again. Never retry a lost or expired receipt automatically.',
  'Status requires the same identity and operationId. Cancel adds confirm:true and closes this workflow; it cannot undo a reset or dismiss an OS prompt or cancel an in-flight directory read. Complete requires confirm:true and humanResponded:true only after answering the OS prompt, then runs the canonical fresh-daemon probe. Only allowed confirms completion; denied/unknown exit 1. No automatic retry or daemon restart. One in-memory operation per runtime; new operation IDs are refused during its 30-minute retention after reset work settles; runtime restart loses the receipt without undoing OS actions.'
]
export const DAEMON_FOLDER_ACCESS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'daemon', 'folder-access-plan'],
    summary: 'Inspect an observed macOS folder permission remedy without changing it',
    usage: 'orca terminal daemon folder-access-plan [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: NOTES
  },
  {
    path: ['terminal', 'daemon', 'folder-access-start'],
    summary: 'Start a pinned human folder permission workflow',
    usage: 'orca terminal daemon folder-access-start --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: NOTES
  },
  {
    path: ['terminal', 'daemon', 'folder-access-status'],
    summary: 'Read the status of a pinned human folder permission workflow',
    usage: 'orca terminal daemon folder-access-status --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: NOTES
  },
  {
    path: ['terminal', 'daemon', 'folder-access-cancel'],
    summary: 'Cancel a pinned human folder permission workflow',
    usage: 'orca terminal daemon folder-access-cancel --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: NOTES
  },
  {
    path: ['terminal', 'daemon', 'folder-access-complete'],
    summary: 'Verify folder access after the human permission response',
    usage: 'orca terminal daemon folder-access-complete --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: NOTES
  }
]
