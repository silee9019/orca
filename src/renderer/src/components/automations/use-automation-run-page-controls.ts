import { useAppStore } from '@/store'
import { useAutomationRunPageViewer } from '../../runtime/automation-run-page-viewer'
import { capturedAutomationOwner, capturedAutomationOwnerKey } from './automation-captured-owner'
import type { AutomationsPageActionContext } from './automations-page-action-context'
import type { AutomationRunActions } from './automation-run-actions'
import type { AutomationRunWorkspaceAction } from './automation-run-workspace-action'
import type { useAutomationRunPageState } from './use-automation-run-page-state'

type Context = Pick<AutomationsPageActionContext, 'local' | 'list' | 'destination' | 'setup'> & {
  runPage: ReturnType<typeof useAutomationRunPageState>
  runActions: AutomationRunActions
  openRunWorkspace: AutomationRunWorkspaceAction
}
export function useAutomationRunPageControls({
  local,
  list,
  destination,
  setup,
  runPage,
  runActions,
  openRunWorkspace
}: Context) {
  const run = setup.selectedAutomationRunPage
  const row = list.selectedRow
  const onBack =
    local.runPageOrigin === 'automation' ? local.showAutomationDetails : local.showRunsDashboard
  const onRerun = async () => {
    if (!run || !row) {
      throw new Error('automation_run_action_unavailable')
    }
    return runActions.rerunAutomationRun(row, run)
  }
  const onOpenWorkspace = () => {
    if (!run) {
      throw new Error('automation_run_action_unavailable')
    }
    return openRunWorkspace(run)
  }
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  useAutomationRunPageViewer({
    enabled: local.pageView === 'run' && run !== null,
    ownerKey: JSON.stringify([
      profile,
      row?.key,
      row?.catalogRef,
      row ? destination.automationAuthorityForRow(row) : null,
      capturedAutomationOwnerKey(
        capturedAutomationOwner(
          destination.automationDispatchContext.capturedOwners,
          row?.key ?? ''
        )
      )
    ]),
    targetKey: JSON.stringify([
      run?.workspaceId,
      run?.terminalPaneKey,
      run?.terminalPtyId,
      run?.status
    ]),
    runId: run?.id ?? null,
    rowKey: row?.key ?? null,
    origin: local.runPageOrigin,
    modalOpen:
      modal !== 'none' ||
      Boolean(local.createOpen || local.deleteTarget || local.externalDeleteTarget),
    canRerun: Boolean(row && run && runPage.canRerunSelectedAutomationRunPage),
    rerunPending: runPage.isSelectedAutomationRunPageRerunPending,
    canOpenWorkspace: runPage.selectedAutomationRunPageViewState?.canOpen === true,
    onBack,
    onRerun,
    onOpenWorkspace
  })
  return { onBack, onRerun, onOpenWorkspace }
}
