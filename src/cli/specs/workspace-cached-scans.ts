import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_CACHED_SCAN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['workspace-cleanup', 'cached-scan'],
    summary: 'Read the selected runtime profile cleanup snapshot',
    usage: 'orca workspace-cleanup cached-scan [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Returns the persisted snapshot or null, using the existing desktop snapshot reader. No live scan is started.',
      'scannedAt and per-row host identities retain their original meaning. Cached candidates are not current deletion permission; run the existing removal preflight before deleting.',
      'The selected runtime owns the profile, including cached SSH rows and folder workspaces. Old hosts fail without reading the CLI client profile.'
    ]
  },
  {
    path: ['workspace-space', 'cached-analysis'],
    summary: 'Read the selected runtime profile space analysis snapshot',
    usage: 'orca workspace-space cached-analysis [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Returns the persisted analysis or null, using the existing desktop snapshot reader. No disk traversal or live capacity measurement is started.',
      'scannedAt, unavailable rows and host identities are cached evidence. The reader preserves its existing omission of detailed top-level items.',
      'The selected runtime owns the profile. Old hosts fail without reading the CLI client profile.'
    ]
  }
]
