import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_LISTENER_COUNT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'data-listener-count'],
    summary: 'Read the pinned host preload PTY data listener count',
    usage: 'orca terminal data-listener-count --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict JSON requires expectedRuntimeId, executionHostId:local, expectedRendererId and timeoutMs (1..10000). Local refers to the selected runtime, including a paired host. The execution host reads its own registered desktop preload; headless hosts and relay-only SSH viewers are unavailable.',
      'Returns the actual ipcRenderer listenerCount for pty:data from the pinned main frame. Navigation, renderer loss, cancellation, foreign senders and subframes cannot satisfy the query. This global count is not per-PTY and does not prove parsing, credit, delivery or pane geometry. No new data listener, fabricated ACK, raw output or viewer activation.'
    ]
  }
]
