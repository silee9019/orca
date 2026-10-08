import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_REVIEW_CACHE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'workspace-cache', 'github'],
    summary: 'Read the addressed runtime profile’s canonical GitHub metadata cache',
    usage: 'orca agent workspace-cache github [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Returns cached PR and issue entries with their original fetchedAt timestamps. Values may be stale and may include private titles, descriptions, repository identities and URLs. This is an explicit private-content read, not a live GitHub query.',
      'Uses the addressed runtime’s Store, including existing SSH and folder workspace cache keys. Does not query GitHub, rewrite the cache, infer GitLab data, or fall back to another profile. Missing Store and old-host support are errors.'
    ]
  }
]
