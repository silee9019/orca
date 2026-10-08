import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_CONTROL_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-control-requests'],
    summary: 'Observe requests sent to one pinned host renderer and terminal',
    usage: 'orca terminal watch-control-requests --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId, expectedRendererId (the host webContents ID, not a window ID) and watchMs. The execution host owns this renderer ID, including paired hosts; an SSH PTY can be viewed by that host renderer.',
      'Ordered NDJSON observes future clear-buffer, reset-input-modes and serialize-buffer requests after the existing renderer send. Ready only confirms the observer registered. Renderer processing, provider success and serialization replies are not proven. No history, buffer content, new renderer, response injection, resize or viewer activation. Existing requests, replies and serializer timeout remain unchanged. A host without that renderer sends no matching requests; old runtimes and replacement incarnations are refused.'
    ]
  }
]
