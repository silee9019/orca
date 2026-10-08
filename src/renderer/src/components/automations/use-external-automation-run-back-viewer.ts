import { useAppStore } from '@/store'
import { useAutomationRunPageViewer } from '../../runtime/automation-run-page-viewer'
import {
  externalAutomationScopeKey,
  externalAutomationJobKey
} from './external-automation-scope-keys'
import type { ExternalAutomationListEntry } from './external-automation-list-entries'
import type { SelectedExternalRunPage } from './automation-page-state'

export function useExternalAutomationRunBackViewer(
  selected: ExternalAutomationListEntry | null,
  page: SelectedExternalRunPage | null,
  onBack: () => void
): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const scope = page?.scope
  useAutomationRunPageViewer({
    enabled: Boolean(
      scope &&
      selected &&
      page &&
      selected.manager.id === page.manager.id &&
      selected.job.id === page.job.id &&
      externalAutomationScopeKey(scope) === externalAutomationScopeKey(selected.scope)
    ),
    source: 'external',
    ownerKey: JSON.stringify([profile, scope, selected?.scope, page?.manager.target]),
    targetKey: JSON.stringify([page?.manager.id, page?.job.id, page?.run.id]),
    rowKey: scope && page ? externalAutomationJobKey(scope, page.job.id) : null,
    runId: page?.run.id ?? null,
    origin: 'automation',
    modalOpen: modal !== 'none',
    canRerun: false,
    rerunPending: false,
    canOpenWorkspace: false,
    onBack,
    onRerun: async () => ({ mutation: 'refused', refresh: 'skipped', notice: null }),
    onOpenWorkspace: () => ({ status: 'unavailable' })
  })
}
