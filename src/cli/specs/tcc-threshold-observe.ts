import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const TCC_THRESHOLD_OBSERVE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['permissions', 'tcc', 'observe'],
    summary:
      'Observe the selected host’s existing macOS TCC threshold events without starting an OS watcher',
    usage: 'orca permissions tcc observe [--timeout <250..3600000 milliseconds>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'timeout'],
    notes: [
      'Emits initial status, original threshold events and a finite end event. Does not request permissions or start a watcher. Unsupported hosts fail explicitly.'
    ]
  }
]
