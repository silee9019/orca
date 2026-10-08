import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKSPACE_GIT_STARTUP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['git', 'await-environment'],
    summary: 'Wait for the selected desktop host Git environment startup barrier',
    usage: 'orca git await-environment [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Waits for the same shell PATH generation and managed WSL CLI startup barrier as the desktop API. Does not wait for unrelated first-window, PTY or hook services.',
      'settled means the existing startup barrier settled. The WSL barrier has its own time budget; this is not proof that all reconciliation finished or that Git is installed.',
      'Node hosts without the desktop barrier and old peers fail explicitly. The CLI never reads local desktop state or starts a separate shell hydration.'
    ]
  }
]
