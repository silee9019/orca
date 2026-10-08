import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_WORK_ITEM_NOTIFY_SPECS: CommandSpec[] = [
  {
    path: ['github', 'notify-work-item-mutated'],
    summary: 'Notify the trusted desktop UI that a registered work item changed',
    usage: 'orca github notify-work-item-mutated --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: expectedExecutionHostId (local), expectedRepoHostId, repoId, type (issue or pr), number (positive integer).',
      'The desktop Store resolves the registered repository and checks its host. The original trusted UI notifier is reused; sender IDs, arbitrary paths and viewer IDs are not accepted.',
      'requested means the notification was accepted. rendered is false because this API has no viewer acknowledgement; an absent viewer does not become a delivery claim.',
      'This does not modify the remote issue or pull request. Missing desktop services and old peers fail without fallback.'
    ]
  }
]
