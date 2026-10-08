import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AGENT_STATUS_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'status', 'watch'],
    summary: 'Observe scoped canonical host status set and clear events',
    usage: 'orca agent status watch --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires paneKeys (1..128 unique stable keys), connectionIds (0..128 unique IDs), and watchMs. Future pane set/clear events use paneKeys; transient disconnect clears independently use the explicit connectionIds. An empty connectionIds list excludes disconnect batches.',
      'Ordered NDJSON reuses the host status store and the same safe metadata as agent status list. Prompts, launch tokens and resume identities are excluded. No replay or process-liveness inference: a transient clear means status is unavailable and never proves exit. Old hosts are refused.'
    ]
  }
]
