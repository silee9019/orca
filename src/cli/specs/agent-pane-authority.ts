import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AGENT_PANE_AUTHORITY_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'status', 'retire-pane'],
    summary: 'Fence one observed pane and its canonical aliases without stopping its process',
    usage: 'orca agent status retire-pane --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires terminal, paneKey, expectedIncarnationId, expectedExecutionHostId, receivedAt, stateStartedAt, expectedObservation and confirm:true. Uses agent status list and terminal identity metadata. Unknown, mismatched, structured or changed ownership is refused.',
      'Returns a generated retirementId for guarded restoration. Existing verified restart recovery can lift the fence automatically. This fences the canonical hook store and aliases; it does not close a pane, stop a process or establish rendered viewer state.'
    ]
  },
  {
    path: ['agent', 'status', 'restore-pane'],
    summary: 'Restore the exact retirement of a still-bound terminal pane',
    usage: 'orca agent status restore-pane --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires terminal, paneKey, expectedIncarnationId, expectedExecutionHostId, retirementId from retire-pane and confirm:true. A replaced retirement, terminal incarnation, changed host or closed tab is refused. Anonymous retirements cannot be restored by this command.',
      'Restores canonical hook authority only. It does not reattach a terminal or replay a status row; later authoritative hooks may publish status again.'
    ]
  },
  {
    path: ['agent', 'status', 'transfer-pane'],
    summary: 'Move one observed status row to the pane its live terminal is now bound to',
    usage: 'orca agent status transfer-pane --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires terminal, fromPaneKey, toPaneKey, expectedIncarnationId, expectedExecutionHostId, receivedAt, stateStartedAt, expectedObservation and confirm:true. Uses agent status list and terminal identity metadata. The terminal must already be bound to toPaneKey, the PTY must still be owned by the source pane, and the destination must have no status row; anything else is refused and nothing moves.',
      'Moves canonical hook authority only and later hooks posted to the source key follow it. A retirement of the destination pane is lifted, as the UI transfer does. It does not move a pane or a terminal. rendererApplied:false: sidebar, unread and launch-config state held by a connected viewer is not moved by this command.'
    ]
  }
]
