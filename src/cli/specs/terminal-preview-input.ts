import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const TERMINAL_PREVIEW_INPUT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'preview-input'],
    summary: 'Send private input through the existing preview mobile-presence lock',
    usage: 'orca terminal preview-input --request-file <path|-> --text-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file', 'text-file'],
    destructive: true,
    notes: [
      'Strict target JSON requires {terminal,expectedPtyId,expectedIncarnationId,expectedExecutionHostId,confirm:true}. Read identities on the same selected execution host. Input is a regular UTF-8 file or piped stdin up to 16 MiB. Only one input may use stdin; terminal text is excluded from receipts.',
      'Reuses canonical preview driving input, including refusal while mobile owns input and between chunks. Checks terminal identity before each chunk. accepted:true means every chunk was accepted by the existing writer, not command execution or rendered echo. A stopped paste may already have sent earlier chunks; refusal returns partialInputPossible:true and exit 1. Cancelling does not undo accepted input.'
    ]
  }
]
