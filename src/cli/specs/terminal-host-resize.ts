import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_HOST_RESIZE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'resize-host'],
    summary: 'Resize a pinned host PTY through the desktop resize policy',
    usage: 'orca terminal resize-host --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId, cols and rows (1..1000), and confirm:true. The execution host and exact provider incarnation own the operation; folder workspaces and SSH PTYs use the same host policy. No viewer activation, synthetic ACK or geometry report.',
      'Uses canonical renderer resize suppression and mobile/remote-desktop ownership guards. A remote-desktop refusal preserves the original reclaim-target cache update for these requested dimensions; it does not claim an on-screen measurement. Successful provider call updates the existing requested-size cache and external resize notification. Receipt providerApplied:true requires matching provider-owned applied-size read-back; absent, failed, null or different read-back exits 1 after a possible resize. Requested cache values are never applied-size proof. rendererApplied:false does not prove screen layout. Old hosts and replaced owners are refused; no automatic retry.'
    ]
  }
]
