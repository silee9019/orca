import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const PLUGIN_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['plugins', 'panel-read'],
    summary: 'Read an approved panel entry without exposing its session token',
    usage: 'orca plugins panel-read --plugin <publisher.id> --panel <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'plugin', 'panel'],
    notes: [
      'Returns HTML without executing it. The temporary panel owner is revoked before returning.'
    ]
  },
  {
    path: ['plugins', 'list'],
    summary: 'List installed plugins and their commands',
    usage: 'orca plugins list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['plugins', 'enable'],
    summary: 'enable an exact installed plugin',
    usage: 'orca plugins enable --plugin <publisher.id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'plugin']
  },
  {
    path: ['plugins', 'disable'],
    summary: 'disable an exact installed plugin',
    usage: 'orca plugins disable --plugin <publisher.id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'plugin']
  },
  {
    path: ['plugins', 'consent'],
    summary: 'Apply consent to the exact reviewed plugin fingerprint',
    usage:
      'orca plugins consent --plugin <publisher.id> --fingerprint <reviewed> --decision <approve|keep-disabled> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'plugin', 'fingerprint', 'decision']
  },
  {
    path: ['plugins', 'command'],
    summary: 'Invoke a contributed plugin worker command',
    usage:
      'orca plugins command --plugin <publisher.id> --command <id> [--input-file <path> | --input-stdin] [--json]',
    notes: [
      'Input requires a declared manifest contract and a supporting runtime. Legacy no-input commands remain supported.',
      'Uses the selected runtime and its consent and capability checks. Built-in viewer aliases are not worker commands.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'plugin', 'command', 'input-file', 'input-stdin']
  },
  {
    path: ['plugins', 'panel'],
    summary: 'Run a panel host action in a temporary owner-bound session',
    usage:
      'orca plugins panel --plugin <publisher.id> --panel <id> --action <name> [--input-file <path> | --input-stdin] [--json]',
    notes: [
      'Runs an existing panel-callable host action, preserving consent and capability checks. The panel token is never printed.',
      'Does not execute panel JavaScript or manipulate a viewer. The session is revoked on completion or disconnect.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'plugin', 'panel', 'action', 'input-file', 'input-stdin']
  }
]
