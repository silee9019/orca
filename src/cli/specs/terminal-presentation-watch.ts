import { GLOBAL_FLAGS, type CommandSpec } from '../args'
const NOTES = [
  'Strict JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId and watchMs. Emits ordered NDJSON ready/event/end frames for one continuous host subscription. Events before ready are not replayed; this is not historical event storage.',
  'Local hosts must advertise terminalPresentationStreaming:1. Paired hosts use the existing authenticated JSON stream. Exit, host replacement, cancellation, disconnect and output memory overflow stop only this subscription. Actual viewer rendering and OS geometry are not confirmed.'
]
export const TERMINAL_PRESENTATION_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'watch-driver'],
    summary: 'Continuously observe canonical terminal input-driver changes',
    usage: 'orca terminal watch-driver --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: NOTES
  },
  {
    path: ['terminal', 'watch-fit'],
    summary: 'Continuously observe canonical terminal fit override changes',
    usage: 'orca terminal watch-fit --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: NOTES
  }
]
