import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const PLUGIN_MANAGEMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['plugins', 'install'],
    summary: 'Install a pinned Git or local-path plugin on the runtime host',
    usage: 'orca plugins install --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Executes on the selected runtime host. Local paths refer to that host.',
      'Input is validated against the runtime contract. Installation does not approve capabilities or enable the plugin.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['plugins', 'marketplace', 'add'],
    summary: 'Add an exact marketplace source',
    usage: 'orca plugins marketplace add --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Executes on the selected runtime host. Local paths refer to that host.',
      'Input is validated against the runtime contract. Installation does not approve capabilities or enable the plugin.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['plugins', 'marketplace', 'remove'],
    summary: 'Remove an exact marketplace source',
    usage: 'orca plugins marketplace remove --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Executes on the selected runtime host. Local paths refer to that host.',
      'Input is validated against the runtime contract. Installation does not approve capabilities or enable the plugin.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['plugins', 'marketplace', 'refresh'],
    summary: 'Refresh one or all configured marketplace sources',
    usage: 'orca plugins marketplace refresh --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Executes on the selected runtime host. Local paths refer to that host.',
      'Input is validated against the runtime contract. Installation does not approve capabilities or enable the plugin.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['plugins', 'marketplace', 'preview'],
    summary: 'Preview an exact marketplace plugin',
    usage: 'orca plugins marketplace preview --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Executes on the selected runtime host. Local paths refer to that host.',
      'Input is validated against the runtime contract. Installation does not approve capabilities or enable the plugin.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['plugins', 'marketplace', 'install'],
    summary: 'Install the exact commits returned by preview',
    usage: 'orca plugins marketplace install --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Executes on the selected runtime host. Local paths refer to that host.',
      'Input is validated against the runtime contract. Installation does not approve capabilities or enable the plugin.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['plugins', 'remove'],
    summary: 'remove for an exact plugin',
    usage: 'orca plugins remove --plugin <publisher.id> [--json]',
    notes: [
      'Protected bundled plugins and development overrides cannot be removed. Rollback uses the recorded installed revision.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'plugin']
  },
  {
    path: ['plugins', 'logs'],
    summary: 'logs for an exact plugin',
    usage: 'orca plugins logs --plugin <publisher.id> [--json]',
    notes: [
      'Protected bundled plugins and development overrides cannot be removed. Rollback uses the recorded installed revision.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'plugin']
  },
  {
    path: ['plugins', 'marketplace', 'preview-update'],
    summary: 'marketplace preview-update for an exact plugin',
    usage: 'orca plugins marketplace preview-update --plugin <publisher.id> [--json]',
    notes: [
      'Protected bundled plugins and development overrides cannot be removed. Rollback uses the recorded installed revision.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'plugin']
  },
  {
    path: ['plugins', 'marketplace', 'rollback'],
    summary: 'marketplace rollback for an exact plugin',
    usage: 'orca plugins marketplace rollback --plugin <publisher.id> [--json]',
    notes: [
      'Protected bundled plugins and development overrides cannot be removed. Rollback uses the recorded installed revision.'
    ],
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'plugin']
  },
  {
    path: ['plugins', 'refresh'],
    summary: 'refresh on the selected runtime',
    usage: 'orca plugins refresh [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['plugins', 'language-packs'],
    summary: 'language-packs on the selected runtime',
    usage: 'orca plugins language-packs [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['plugins', 'marketplace', 'list'],
    summary: 'marketplace list on the selected runtime',
    usage: 'orca plugins marketplace list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['plugins', 'marketplace', 'plugins'],
    summary: 'marketplace plugins on the selected runtime',
    usage: 'orca plugins marketplace plugins [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
