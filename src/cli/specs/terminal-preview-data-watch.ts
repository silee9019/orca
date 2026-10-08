import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TERMINAL_PREVIEW_DATA_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-preview-data'],
    summary: 'Observe private data sent to one pinned preview renderer',
    usage: 'orca terminal watch-preview-data --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId, expectedRendererId (host preview webContents ID), includeContent:true and watchMs. Use a private stdout destination. The selected runtime owns the host preview viewing this PTY; SSH execution host identity remains pinned.',
      'Ordered NDJSON observes future terminalPreview:data sends from existing preview streams, preserving data/bytes or resync payloads. Ready only confirms observer registration, not an active preview. rendererApplied:false never proves receipt, parsing, ACK or recovery. The CLI does not connect a preview, retrieve snapshot/replay, register a raw view, claim a fit, acknowledge bytes, input, resize, unsubscribe a viewer or activate windows. Existing trust, stream buffering/credit and destroyed-window cleanup remain in effect. Old runtimes and replaced owners are refused. Each data field is limited to 2Mi characters and stdout to 4MiB; overflow fails without a complete-stream claim.'
    ]
  }
]
