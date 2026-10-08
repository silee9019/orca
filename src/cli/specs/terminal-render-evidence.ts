import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_RENDER_EVIDENCE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'write-render-evidence'],
    summary: 'Store private supplied render-desync evidence on the selected runtime',
    usage: 'orca terminal write-render-evidence --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict private JSON requires expectedRuntimeId, executionHostId:local, captureId UUID, phase:corrupt|healed, source:cli-supplied, confirm:true, includeContent:true and pngDataUrl (PNG signature, at most 2MiB encoded); optional metadata is limited to 256KiB serialized. Local refers to the selected runtime, including paired hosts. Relay SSH and mobile callers are outside this scope.',
      'Uses the existing host evidence writer and its shared write queue. Stores under the selected app userData/terminal-render-desync-evidence/cli-<captureId>, with private modes and exclusive phase files. Existing phases and symbolic-link capture directories are refused. No automatic retry: a failed write can leave partial evidence.',
      'Receipt hostPaths belong to the selected host. Read-back hashes verify stored bytes, not renderer pixels or healing. CLI provenance is stored with metadata; image and metadata are never echoed. The shared writer retains newest four capture directories within 96MiB, without a time expiry; old captures can be pruned, including desktop captures. This command neither takes a screenshot nor activates a viewer.'
    ]
  }
]
