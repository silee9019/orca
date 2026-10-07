import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ACCOUNT_PREFERENCE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account', 'preference', 'status'],
    summary: 'Show account location, provider sites and workspace override presence',
    usage: 'orca account preference status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['account', 'preference', 'set'],
    summary: 'Set account location or provider endpoint preferences on this host',
    usage:
      'orca account preference set --key localAccountRuntime|localAccountWslDistro|minimaxEndpoint|zcodePlanSite|opencodeWorkspaceId --value <value> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'value'],
    notes: [
      'Use value default for the default WSL distro. WSL settings require host capability validation.'
    ]
  }
]
