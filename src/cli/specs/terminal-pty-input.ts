import { GLOBAL_FLAGS, type CommandSpec } from '../args'

const INPUT_NOTES = [
  'Strict target JSON requires terminal, expectedPtyId, expectedIncarnationId, expectedExecutionHostId and confirm:true. Input is strict UTF-8, bounded to 16 MiB, and read only from text-file or stdin. Only one input may use stdin.',
  'Preserves the host viewport claim queue, mobile driver lock and per-chunk ownership guards. write-input-accepted acknowledges only a local live PTY; SSH relay notifications cannot prove acceptance. write-input queued:true means the canonical writer returned without refusal, never command execution or rendered echo. Refusal returns exit 1 and partialInputPossible:true; already written chunks are not undone.'
]

export const TERMINAL_PTY_INPUT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'write-input'],
    summary: 'Write private driving input through the canonical PTY writer',
    usage: 'orca terminal write-input --request-file <path|-> --text-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file', 'text-file'],
    destructive: true,
    notes: INPUT_NOTES
  },
  {
    path: ['terminal', 'write-input-accepted'],
    summary: 'Write private driving input through the canonical PTY writer',
    usage:
      'orca terminal write-input-accepted --request-file <path|-> --text-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file', 'text-file'],
    destructive: true,
    notes: INPUT_NOTES
  }
]
