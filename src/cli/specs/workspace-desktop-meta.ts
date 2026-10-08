import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_DESKTOP_META_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'update-desktop-meta'],
    summary: 'Update desktop workspace metadata on an explicit host',
    usage:
      'orca worktree update-desktop-meta --params-file <file|-> --confirm <worktreeId> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file', 'confirm'],
    notes: [
      'JSON: {worktreeId, executionHostId, updates}. The worktree ID must belong to a repo registered on that host. A different host with the same ID is preserved. Empty displayName clears a label; empty comment clears its text.',
      'Reuses the desktop metadata writer, linked-item identity checks, display-name pinning and remote-only title notification. System provenance and hostId in updates are rejected; executionHostId selects the owner. Lineage belongs to its separate command.',
      'Supports checked metadata, diff comments and version-1 mobile review state. Success follows the profile write barrier; a failed save does not guarantee an in-memory rollback. Output contains an acknowledgement and identity, not the metadata text.',
      'Node hosts without the desktop service and old peers fail without client-profile writes. This changes metadata and does not perform Git, SSH filesystem or renderer navigation operations.'
    ]
  }
]
