import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const PTY_PROVIDER_SESSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['terminal', 'provider-sessions'],
    summary: 'List sessions from one explicit execution-host PTY provider',
    usage: 'orca terminal provider-sessions --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Request JSON chooses connectionId: null selects the addressed runtime’s local provider; a string selects its attached SSH provider. Missing or failed selected providers are errors, never an empty local fallback.',
      'Reuses the renderer inventory and refreshes canonical PTY ownership routing. Local queries await provider startup before selecting the owner. Does not spawn, attach, resize or stop any session.',
      'Alternatively diagnostic:true requests the legacy census across registered providers. It may omit failed SSH providers, so its receipt always says complete:false; it never proves an absent process exited.',
      'Output explicitly includes private cwd/title/worktree metadata. agentOwnership is present, absent or unknown; unknown never proves absence. This inventory does not prove a worker process exited.'
    ]
  }
]
