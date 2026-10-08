import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_VISIBLE_WORKTREE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['worktree', 'list-visible'],
    summary: 'Read the desktop visible workspace list for an explicit repo host',
    usage: 'orca worktree list-visible --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {repoId, executionHostId}. Reuses the desktop visible listing, folder support, metadata ownership repair, scan hygiene and removal markers. The repo ID may repeat on different hosts; host selection is explicit.',
      'SSH loss can yield existing cached metadata rows or an empty list, matching the desktop API. Rows and row count are not proof of process liveness, contact or an authoritative inventory.',
      'This reader can repair host metadata and apply existing fresh-scan side effects. It does not start a separate scanner. Node hosts without the desktop service and old peers fail without scanning the client profile. Runtime-owned paths require their owning runtime.'
    ]
  },
  {
    path: ['worktree', 'list-all-visible'],
    summary: 'Read the selected desktop host visible workspace catalog',
    usage: 'orca worktree list-all-visible [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Uses the same bounded fanout and native/SSH/folder visible list as the desktop API. Host identities remain on returned rows, including separate rows that share an ID and path.',
      'Preserves existing metadata repair, scan side effects and removal markers. SSH loss can retain cached rows or omit results; an empty catalog does not prove that remote work exited.',
      'A catalog containing another runtime owner fails before listing instead of executing those paths locally. Node hosts without the desktop service and old peers fail without client profile fallback.'
    ]
  }
]
