import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_REPO_USERNAME_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['repo', 'git-username-for-host'],
    summary: 'Read the desktop Git username for an explicit repo host',
    usage: 'orca repo git-username-for-host --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'JSON: {repoId, hostId}. Repo IDs can repeat on different hosts; selection is explicit. Reuses the desktop native or SSH username resolver and does not read Git config from the client profile.',
      'Native Git uses explicit username config before the existing hosted-account policy. SSH uses only that provider’s explicit username config and never the desktop account cache. Folder repos and unknown/disconnected SSH results remain empty strings; empty is not evidence of an absent account or an exited remote process.',
      'WSL paths and other runtime owners fail before using the native account cache. Node hosts without the desktop service and old peers fail without client-side fallback. No account login or settings mutation is performed.'
    ]
  }
]
