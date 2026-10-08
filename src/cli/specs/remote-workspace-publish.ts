import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const REMOTE_WORKSPACE_PUBLISH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'publish-workspace'],
    summary: 'Publish session state only to explicitly observed connected SSH targets',
    usage: 'orca terminal publish-workspace --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict JSON requires {targets:[{targetId,expectedRevision,hostObservationToken}],session?,confirm:true}. Read each observation with terminal remote-workspace on the same selected runtime. Up to 128 distinct targets. Optional session must be lossless; omitted session uses each target’s persisted host partition and canonical host filtering.',
      'Reuses existing per-target queue and revision/token guards. Receipts omit session bodies. accepted:true includes an identical cached-session no-op and does not prove current host contact, a new remote write, or viewer hydration. Any missing, stale or unavailable target returns exit 1 and partialPublishPossible:true. Cancelling or losing contact does not undo posts already queued; read every target before retrying.'
    ]
  }
]
