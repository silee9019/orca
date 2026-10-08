import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const TERMINAL_DELIVERY_DEBUG_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'delivery-debug'],
    summary: 'Read the execution host’s canonical renderer delivery counters',
    usage: 'orca terminal delivery-debug [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads host-wide delivery diagnostics without returning pending terminal text. An uninstalled debug bridge is an error.'
    ]
  },
  {
    path: ['terminal', 'reset-delivery-debug'],
    summary: 'Reset host-wide renderer delivery diagnostics and reseed current peaks',
    usage: 'orca terminal reset-delivery-debug --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires {confirm:true}. Resets diagnostic counters for every terminal on the addressed host. Does not discard pending terminal output or stop processes.'
    ]
  }
]
