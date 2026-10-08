import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_REMOTE_FOLDER_DOWNLOAD_SPECS: CommandSpec[] = [
  {
    path: ['file', 'remote-folder-download-start'],
    summary: 'Download an SSH folder to a confirmed native destination',
    usage:
      'orca file remote-folder-download-start --params-file <file|-> --confirm <destinationPath> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input: expectedExecutionHostId:local, expectedWriteHostId:local, connectionId, expectedReadHostId:ssh:<connectionId>, absolute dirPath and native destinationPath. Folder workspaces may supply their remote directory directly.',
      'Requires the existing connected SSH filesystem provider and original native user-file write permission. Returns a separate pending UUID; status reports actual completion after original no-clobber promotion. Existing or symbolic destinations are preserved. No dialog, local fallback or overwrite.',
      'One active or cleanup-pending request per desktop profile; status polling keeps it alive and fifteen minutes without polling requests cancellation. Cancel waits up to 20 seconds for the provider, then reports cancel_requested and cleans once the provider settles. Output contains state and cleanupPending, never file bytes or provider errors. Old peers fail explicitly.'
    ]
  },
  {
    path: ['file', 'remote-folder-download-status'],
    summary: 'Read owned SSH folder download state',
    usage: 'orca file remote-folder-download-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: expectedExecutionHostId:local, server requestId. States: pending/downloading/promoting/cancel_requested/completed/cancelled/failed. Clean terminal metadata expires after fifteen minutes; lost SSH contact is a failed transfer, never proof of successful completion.'
    ]
  },
  {
    path: ['file', 'remote-folder-download-cancel'],
    summary: 'Cancel and clean only an owned SSH folder download',
    usage:
      'orca file remote-folder-download-cancel --params-file <file|-> --confirm <requestId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'Input: expectedExecutionHostId:local, server requestId. Removes the original private staging directory once the provider promise settles. Changed identities remain untouched with cleanupPending:true for exact retry. Completed destinations remain intact. Renderer transfer IDs are rejected.'
    ]
  }
]
