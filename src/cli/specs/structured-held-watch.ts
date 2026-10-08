import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const STRUCTURED_HELD_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'session', 'watch-held'],
    summary: 'Continuously observe the selected execution host’s structured-session held changes',
    usage: 'orca agent session watch-held --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires watchMs. Ordered NDJSON contains future canonical structured-session held boolean changes; historical events are not replayed.',
      'Uses the existing host registry on the selected local or paired host and refuses old hosts. Building an empty host does not hold a chat. No session contents or historical events are returned; held does not imply any agent process is live.'
    ]
  }
]
