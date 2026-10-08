import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_CLEANUP_DISMISSAL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['workspace-cleanup', 'dismiss'],
    summary: 'Merge cleanup dismissals in the selected runtime profile',
    usage: 'orca workspace-cleanup dismiss --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {dismissals: [{worktreeId, dismissedAt, fingerprint, classifierVersion: 2, executionHostId?}], removedWorktreeIds?}. Uses the existing desktop dismissal policy.',
      'Host-qualified rows stay separate. Omitting executionHostId preserves legacy ID-only dismissal behavior. removedWorktreeIds prunes every host entry with each ID, matching the desktop API.',
      'Changes saved cleanup visibility only; no worktree, folder, process or snapshot is removed. Old hosts fail without modifying the client profile.'
    ]
  },
  {
    path: ['workspace-cleanup', 'clear-dismissals'],
    summary: 'Clear saved cleanup dismissals in the selected runtime profile',
    usage: 'orca workspace-cleanup clear-dismissals --confirm workspace-cleanup [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm'],
    notes: [
      'Clears every saved dismissal in the selected runtime profile while preserving cleanup browse settings. No live scan starts and no workspace is deleted.',
      'The acknowledgement covers persisted host state, not a rendered viewer. Old hosts fail without modifying the client profile.'
    ]
  }
]
