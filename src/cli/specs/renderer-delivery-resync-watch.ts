import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const RENDERER_DELIVERY_RESYNC_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-delivery-resync'],
    summary: 'Observe delivery resync probes sent to one pinned host renderer',
    usage: 'orca terminal watch-delivery-resync --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires expectedRuntimeId, executionHostId:local, expectedRendererId (the host webContents ID) and watchMs. Local refers to the selected runtime, including paired hosts. This renderer-wide request has no PTY ID and can concern local or SSH PTYs viewed by that host.',
      'Ordered NDJSON observes future canonical delivery-resync requests after renderer send, with the original numeric requestId. Ready only confirms observer registration. rendererApplied:false means neither renderer receipt nor delivery recovery is proven. No data, history, acknowledgement, credit change, response injection or viewer activation. Existing pending-request suppression and timeout remain unchanged. Old runtimes and foreign scopes are refused.'
    ]
  }
]
