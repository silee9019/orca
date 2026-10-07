import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const SPARSE_PRESET_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['sparse-presets', 'list'],
    summary: 'List sparse presets for an exact repository',
    usage: 'orca sparse-presets list --repo <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'repo']
  },
  {
    path: ['sparse-presets', 'save'],
    summary: 'Save a named sparse preset through the existing repository service',
    usage: 'orca sparse-presets save --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'The request contains repo, name, directories, and optional existing id. Directories must be relative to the repository.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  },
  {
    path: ['sparse-presets', 'remove'],
    summary: 'Remove an exact sparse preset from its owning repository',
    usage: 'orca sparse-presets remove --repo <selector> --preset <id> [--json]',
    destructive: true,
    allowedFlags: [...GLOBAL_FLAGS, 'repo', 'preset']
  }
]
