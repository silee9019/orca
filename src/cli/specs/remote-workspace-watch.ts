import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const REMOTE_WORKSPACE_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'remote-workspace', 'watch'],
    summary: 'Continuously observe selected canonical remote workspace snapshots',
    usage: 'orca agent remote-workspace watch --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict private JSON requires unique targetIds (1–128) and watchMs. Output contains private session titles, paths and layouts from canonical changed and stale-resync notifications. Events before ready are not replayed.',
      'Ready confirms that an observer is installed, not contact or process liveness. Uses the selected runtime’s existing target store; no new SSH connection, cache, resync request or fallback is created. Unsupported or unavailable hosts fail explicitly.'
    ]
  }
]
