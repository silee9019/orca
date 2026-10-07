import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const ACCOUNT_SECRET_SETTING_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['secrets', 'set'],
    summary: 'Set a sensitive account setting from a file or stdin on this host',
    usage:
      'orca secrets set --key agentDefaultEnv|httpProxyUrl|httpProxyBypassRules|opencodeSessionCookie --input-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'input-file'],
    notes: [
      'agentDefaultEnv input is a JSON object of agent names and environment variable objects.'
    ]
  },
  {
    path: ['secrets', 'clear'],
    destructive: true,
    summary: 'Clear a sensitive account setting on this host',
    usage: 'orca secrets clear --key <key> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'key']
  }
]
