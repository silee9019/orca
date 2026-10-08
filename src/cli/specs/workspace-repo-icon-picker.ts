import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_REPO_ICON_PICKER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'icon-picker-start'],
    summary: 'Start a PNG icon selection on the selected desktop host',
    usage: 'orca repo icon-picker-start --params-file <file|-> --confirm repo-icon-picker [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {expectedExecutionHostId:"local"}. Starts the original native PNG picker on that desktop and returns a requestId without waiting for a person. Can open or focus an OS selection window. The desktop user must select a PNG or cancel the window.',
      'Only one CLI picker can remain active. Reuses the PNG-extension and 256KB policy and also checks bytes after reading. Does not apply a repo setting, upload an image or start a client/SSH picker. Node hosts without the desktop service and old peers fail explicitly.',
      'Use status/cancel/result with the same owning runtime and requestId. Completion is not human approval of a repo setting. In-memory requests do not survive an app restart.'
    ]
  },
  {
    path: ['repo', 'icon-picker-status'],
    summary: 'Read a desktop repo icon picker request state',
    usage: 'orca repo icon-picker-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId, expectedExecutionHostId:"local"}. Reports pending, cancel_requested, completed, cancelled or failed, plus the required human action. Does not return image bytes or a server filesystem path.',
      'Completed results are bounded to eight records and expire after 15 minutes. Active selection stays pending until its native promise settles. Missing/expired/restarted request records do not prove an OS window closed or an operation stopped.'
    ]
  },
  {
    path: ['repo', 'icon-picker-cancel'],
    summary: 'Request cancellation and discard a retained repo icon result',
    usage: 'orca repo icon-picker-cancel --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {requestId, expectedExecutionHostId:"local"}. A pending request becomes cancel_requested and rejects any later file/result acceptance. This command cannot close the OS file picker; the desktop user must close it.',
      'The request remains active and blocks another CLI picker until the native promise settles, then becomes cancelled. Cancelling a completed result discards its retained bytes and does not delete an already exported client file. Poll status to confirm completion.'
    ]
  },
  {
    path: ['repo', 'icon-picker-result'],
    summary: 'Save a completed repo icon PNG to a new client file',
    usage: 'orca repo icon-picker-result --params-file <file|-> --output <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'output'],
    notes: [
      'JSON: {requestId, expectedExecutionHostId:"local"}. Requires a completed retained result. Checks the existing repo-icon PNG data URI policy and 256KB bound, then writes --output on the client with exclusive creation and private permissions. The parent directory must already exist.',
      'Never overwrites a file or prints base64/server paths. Returns only the client output path and byte count. Does not apply a repo setting. Expired, pending, cancelled, failed, missing-service and old-peer requests fail without a local picker fallback.'
    ]
  }
]
