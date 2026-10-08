import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_PROJECT_DATA_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['project', 'update'],
    summary: 'Project update on the selected Orca runtime',
    usage: 'orca project update --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: projectId, updates.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the ProjectUpdate parameters from project-runtime-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
