import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SEARCH_CONSENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['search', 'consent'],
    summary: 'Change session search consent on an explicitly selected paired host',
    usage:
      'orca search consent --host runtime:<id> --enabled true|false --confirm runtime:<id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'host', 'enabled', 'confirm'],
    notes: ['Local and SSH hosts cannot use the paired-client consent service.']
  }
]
