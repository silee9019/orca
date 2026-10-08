import { withTimeout } from '../../../shared/promise-timeout-fallback'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'
import type { ActivityViewerResult } from '../../../shared/activity-viewer-command'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import {
  isActivityScopeCommand,
  type readActivityScope,
  readPersistedActivityScope,
  sameActivityScope
} from './activity-scope-preferences'

export function readActivityViewerPersistence(
  command: ActivityViewerCommand,
  ui: PersistedUIState | null,
  expected: {
    groupBy: string
    readFilter: string
    compact: boolean
    showChildAgents: boolean
    showSearch?: boolean
  },
  expectedScope: ReturnType<typeof readActivityScope> | undefined,
  writeOutcome: ActivityViewerResult['writeOutcome']
) {
  const scopeCommand = isActivityScopeCommand(command)
  const persistedScope = scopeCommand && ui !== null ? readPersistedActivityScope(ui) : null
  const persisted =
    ui !== null && (!scopeCommand || persistedScope !== null)
      ? writeOutcome !== 'rejected' &&
        (expectedScope !== undefined
          ? sameActivityScope(persistedScope, expectedScope)
          : command.operation === 'group'
            ? ui.agentsGroupBy === expected.groupBy
            : command.operation === 'read'
              ? ui.agentsReadFilter === expected.readFilter
              : command.operation === 'compact'
                ? ui.agentsCompactMode === expected.compact
                : command.operation === 'children'
                  ? ui.agentsShowChildAgents === expected.showChildAgents
                  : command.operation === 'search-visible'
                    ? ui.agentsShowSearch === expected.showSearch
                    : ui.agentsGroupBy === expected.groupBy &&
                      ui.agentsReadFilter === expected.readFilter &&
                      ui.agentsCompactMode === expected.compact &&
                      ui.agentsShowChildAgents === expected.showChildAgents)
      : null
  return { persisted, persistedScope }
}

export async function readActivityPersistenceWriteOutcome(
  saving: Promise<void> | undefined,
  expiresAt: number
): Promise<ActivityViewerResult['writeOutcome']> {
  return saving
    ? withTimeout<ActivityViewerResult['writeOutcome']>(
        saving.then(
          () => 'accepted',
          () => 'rejected'
        ),
        Math.max(0, Math.min(expiresAt - 100, Date.now() + 5000) - Date.now()),
        'unknown'
      )
    : 'not_requested'
}
