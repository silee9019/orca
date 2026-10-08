import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_RENDERER_REPLAY_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-renderer-replay'],
    summary: 'Observe private SSH replay payloads sent to one pinned host renderer',
    usage: 'orca terminal watch-renderer-replay --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId, expectedRendererId (host webContents ID), includeContent:true and watchMs. Content can contain private replay; use a private stdout destination. The selected runtime owns the host renderer viewing that SSH PTY.',
      'Ordered NDJSON observes future pty:replay payloads after canonical renderer send, preserving id/data. origin distinguishes current provider-replay from validated reattach-replay. Existing provider generation and reattach ownership guards remain in effect. Ready only confirms observer registration; rendererApplied:false never proves receipt, parsing or recovery. No snapshot/history retrieval, new replay request, input, ACK, credit, geometry or viewer activation. No matching renderer means no payload. Old runtimes, replacement owners and foreign scopes are refused. Each data field is limited to 2Mi characters and stdout to 4MiB; overflow fails without a complete-stream claim.'
    ]
  }
]
