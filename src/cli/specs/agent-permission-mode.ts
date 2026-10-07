import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AGENT_PERMISSION_MODE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent-permissions', 'status'],
    summary: 'Show the saved agent launch permission preference',
    usage: 'orca agent-permissions status [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['agent-permissions', 'set'],
    summary: 'Set the agent launch permission preference while preserving custom overrides',
    usage: 'orca agent-permissions set --mode yolo|manual [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'mode'],
    notes: [
      'Updates launch defaults for future agents. Existing custom arguments and environments are preserved.'
    ]
  }
]
