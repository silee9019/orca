import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_RENDERER_DATA_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-renderer-data'],
    summary: 'Observe private PTY payloads sent to one pinned host renderer',
    usage: 'orca terminal watch-renderer-data --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId, expectedRendererId (host webContents ID), includeContent:true and watchMs. Content can contain private output; use a private destination for stdout. The selected runtime owns this renderer, including views of SSH PTYs.',
      'Ordered NDJSON observes future pty:data payloads after canonical renderer send, preserving id/data and optional seq/rawLength/transformed/background/droppedOutput. origin distinguishes pty-output and synthetic-title copies; synthetic titles are not raw PTY output. Ready only confirms observer registration, rendererApplied:false never proves receipt or parsing. No snapshot, history, input, ACK, credit, geometry or viewer activation. A host without that renderer sends no matching payloads. Old runtimes, replacement owners and foreign scopes are refused. Each data field is limited to 2Mi characters and stdout to 4MiB; overflow fails without a complete-stream claim.'
    ]
  }
]
