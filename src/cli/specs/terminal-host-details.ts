import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const REQUEST_FLAGS = [...GLOBAL_FLAGS, 'request-file']

export const TERMINAL_HOST_DETAILS_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'confirm-foreground'],
    summary: 'Request fresh foreground-process evidence from the execution provider',
    usage: 'orca terminal confirm-foreground --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Requires {terminal, expectedIncarnationId?}. Missing confirmation returns null without using cached process identity.'
    ]
  },
  {
    path: ['terminal', 'presence'],
    summary: 'Read three-valued PTY presence from the execution host',
    usage: 'orca terminal presence --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: [
      'Returns true, false, or null for unknown host contact. Observed terminal exit returns false without probing a replacement process.'
    ]
  },
  {
    path: ['terminal', 'size'],
    summary: 'Read the addressed terminal’s current provider dimensions',
    usage: 'orca terminal size --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: ['Requires {terminal, expectedIncarnationId?}. Unknown dimensions are null.']
  },
  {
    path: ['terminal', 'cwd'],
    summary: 'Read the addressed terminal’s current execution directory',
    usage: 'orca terminal cwd --request-file <path|-> [--json]',
    allowedFlags: REQUEST_FLAGS,
    notes: ['Requires {terminal, expectedIncarnationId?}. Reads the execution provider.']
  }
]
