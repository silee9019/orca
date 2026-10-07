import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ACCOUNT_CREDENTIAL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['credentials', 'status'],
    summary: 'Show saved provider credential status without exposing secrets',
    usage:
      'orca credentials status --provider minimax-cookie|minimax-api-key|opencode-go|zcode-plan|bitbucket [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'provider']
  },
  {
    path: ['credentials', 'save'],
    summary: 'Save a provider credential from a file or stdin on this host',
    usage: 'orca credentials save --provider <provider> --input-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'provider', 'input-file'],
    notes: [
      'Use --input-file - to read from stdin. Credential values are never accepted as command arguments.'
    ]
  },
  {
    path: ['credentials', 'clear'],
    destructive: true,
    summary: 'Clear the saved provider credential on this host',
    usage: 'orca credentials clear --provider <provider> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'provider']
  }
]
