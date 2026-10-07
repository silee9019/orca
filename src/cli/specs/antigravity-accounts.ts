import { GLOBAL_FLAGS, type CommandSpec } from '../args'

const TARGET_FLAGS = [...GLOBAL_FLAGS, 'runtime', 'wsl-distro']
export const ANTIGRAVITY_ACCOUNT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account', 'antigravity', 'list'],
    summary: 'List saved and native Antigravity accounts on this host',
    usage: 'orca account antigravity list [--runtime host|wsl] [--wsl-distro <name>] [--json]',
    allowedFlags: TARGET_FLAGS
  },
  {
    path: ['account', 'antigravity', 'add-current'],
    summary: 'Save the current native Antigravity account',
    usage:
      'orca account antigravity add-current [--runtime host|wsl] [--wsl-distro <name>] [--json]',
    allowedFlags: TARGET_FLAGS
  },
  {
    path: ['account', 'antigravity', 'select'],
    summary: 'Select a saved native Antigravity account for future launches',
    usage:
      'orca account antigravity select --account <id> [--runtime host|wsl] [--wsl-distro <name>] [--json]',
    allowedFlags: [...TARGET_FLAGS, 'account']
  },
  {
    path: ['account', 'antigravity', 'rm'],
    destructive: true,
    summary: 'Remove an inactive saved Antigravity account',
    usage:
      'orca account antigravity rm --account <id> --confirm true [--runtime host|wsl] [--wsl-distro <name>] [--json]',
    allowedFlags: [...TARGET_FLAGS, 'account', 'confirm']
  },
  {
    path: ['account', 'antigravity', 'usage'],
    summary: 'Refresh Antigravity usage while checking the native account identity',
    usage: 'orca account antigravity usage [--runtime host|wsl] [--wsl-distro <name>] [--json]',
    allowedFlags: TARGET_FLAGS
  }
]
