import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AGENT_AWAKE_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'awake', 'watch'],
    summary: 'Continuously observe the selected execution host’s awake status changes',
    usage: 'orca agent awake watch --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires watchMs. Ordered NDJSON contains future canonical awake mode and active state changes; historical events are not replayed.',
      'This subscription does not change awake settings or start a power assertion. It uses the selected local or paired host and refuses unavailable services or old hosts. Status is the service decision, not proof of an OS assertion or lid behavior.'
    ]
  }
]
