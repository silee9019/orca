import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_REMOTE_FILE_DOWNLOAD_SPECS: CommandSpec[] = [
  {
    path: ['file', 'remote-file-download-start'],
    summary: 'Download an SSH file to a confirmed native destination',
    usage:
      'orca file remote-file-download-start --params-file <file|-> --confirm <destinationPath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input: expectedExecutionHostId:local, expectedWriteHostId:local, connectionId, expectedReadHostId:ssh:<connectionId>, absolute filePath, native destinationPath and overwrite (default false).',
      'Requires the existing connected SSH filesystem provider and original native user-file write permission. Returns a separate pending UUID; status reports completion only after the original sibling promotion. Existing destinations require overwrite:true; symbolic links, directories and remote directories are rejected. No dialog or local fallback.',
      'One active or cleanup-pending request per desktop profile; status polling keeps it alive and fifteen minutes without polling requests cancellation. The provider cannot interrupt a running file transfer: cancel waits up to 20 seconds, then reports cancel_requested and the owned staged file is removed once the provider settles. Output contains state and cleanupPending, never file bytes or provider errors. Old peers fail explicitly.'
    ]
  },
  {
    path: ['file', 'remote-file-download-status'],
    summary: 'Read owned SSH file download state',
    usage: 'orca file remote-file-download-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: expectedExecutionHostId:local, server requestId. States: pending/downloading/promoting/cancel_requested/completed/cancelled/failed. Clean terminal metadata expires fifteen minutes after the last status read; lost SSH contact is a failed transfer, never proof of successful completion.'
    ]
  },
  {
    path: ['file', 'remote-file-download-cancel'],
    summary: 'Cancel and clean only an owned SSH file download',
    usage:
      'orca file remote-file-download-cancel --params-file <file|-> --confirm <requestId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input: expectedExecutionHostId:local, server requestId. Removes only the staged file this request owns; a replaced or linked path stays untouched with cleanupPending:true for exact retry. A completed destination remains intact. Renderer transfer IDs are rejected.'
    ]
  }
]
