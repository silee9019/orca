import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GITLAB_COMMAND_SPECS_3: CommandSpec[] = [
  {
    path: ['gitlab', 'work-item-by-path'],
    summary: 'Gitlab work item by path on the selected Orca runtime',
    usage: 'orca gitlab work-item-by-path --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input fields: repo, host, path, iid, type.',
      'The selected Orca runtime owns execution and provider credentials; the command never falls back to the CLI filesystem or another host.',
      'Pass a JSON file with the WorkItemByPath parameters from gitlab-params. Use --params-file - to read stdin. No inline credential arguments.'
    ]
  }
]
