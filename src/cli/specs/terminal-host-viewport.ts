import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_HOST_VIEWPORT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'claim-host-viewport'],
    summary: 'Claim a pinned host renderer viewport through its existing input queue',
    usage: 'orca terminal claim-host-viewport --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId, expectedRendererId (registered host webContents ID), cols/rows (1..1000), confirm:true. Headless runtimes, other windows/runtimes and destroyed or replaced owners are refused. An in-flight navigation or renderer process loss invalidates the claim.',
      'Uses the canonical remote-desktop host claim and existing claim-before-input queue. Queued layout checks retain the same owner guard without publishing it over the wire or storing it in layout state. Mobile ownership remains authoritative. canonicalClaimAccepted is the service result; hostResizeEligible additionally excludes mobile and remote-desktop sizing. Neither proves provider dimensions, renderer parsing or actual pane geometry: rendererApplied:false and viewportGeometryVerified:false are explicit. Already-host claims may be no-ops at a different size. No input, fabricated ACK, viewer activation or automatic retry. A failure after dispatch can leave partial effects; pending input remains gated by canonical claim settlement.'
    ]
  }
]
