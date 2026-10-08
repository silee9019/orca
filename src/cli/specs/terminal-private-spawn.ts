import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_PRIVATE_SPAWN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'spawn'],
    summary: 'Spawn a private pinned background terminal through the canonical runtime launcher',
    usage: 'orca terminal spawn --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Strict private JSON requires expectedRuntimeId, expectedExecutionHostId (local or ssh:<target> relative to the selected runtime), worktreeId, clientMutationId UUID, cols/rows (1..1000), confirm:true. Optional command, cwd, env, envToDelete, shell, launchConfig, resumeProviderSession, launchAgent, startupCommandDelivery, terminal protocol/color options and title follow the runtime launch policy. tabId and leafId must be supplied together. Folder workspaces are supported. Runtime proxy host IDs are refused; unavailable SSH execution never falls back to local.',
      'Uses canonical terminal creation, stable-pane admission, shell preflight, host environment, hidden spawn and persisted host binding. requireFreshPane defaults to true; explicitly false permits stable-pane reattachment. Receipt reports isReattach and requested size without claiming provider geometry or renderer application. No viewer activation. Raw command/env are never echoed. Shell choice uses the existing Windows-only allowlist and never becomes command text.',
      'Mutation IDs use the existing per-client, per-workspace bounded in-flight create deduplication. Settled requests are not cached: repeating one can dispatch another spawn, subject to canonical stable-pane admission. Reuse an ID only for the identical immutable request. No automatic retry or reconciliation is performed; timeout or error after dispatch may leave a live process and partial persisted state. This does not expose renderer-owned replacement/cold-restore/ACK or caller-created surface authority.'
    ]
  }
]
