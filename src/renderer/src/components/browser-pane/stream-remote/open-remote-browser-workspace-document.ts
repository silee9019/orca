import { useAppStore } from '@/store'
import { convertBrowserPageToWorkspaceDoc } from '@/lib/file-preview'
import { resolveWorktreeOperationRoute } from '@/lib/worktree-operation-route'
import { browserPageDocLocationsEqual } from '../../../../../shared/browser-page-doc-location'
import type { BrowserPageDocLocation } from '../../../../../shared/browser-workspace-types'
import type { BrowserRemoteDocumentState } from '../../../../../shared/rpc-contract/browser-remote-pane-params'
export function openRemoteBrowserWorkspaceDocument(
  sourcePageId: string,
  environmentId: string,
  location: BrowserPageDocLocation,
  convert: (
    location: BrowserPageDocLocation
  ) => ReturnType<typeof convertBrowserPageToWorkspaceDoc> = (value) =>
    convertBrowserPageToWorkspaceDoc(sourcePageId, value)
): BrowserRemoteDocumentState {
  const before = useAppStore.getState()
  const source = Object.values(before.browserPagesByWorkspace)
    .flat()
    .find((page) => page.id === sourcePageId)
  const sourceRoute = source ? resolveWorktreeOperationRoute(before, source.worktreeId) : null
  const targetRoute = resolveWorktreeOperationRoute(before, location.worktreeId)
  if (
    !source ||
    !sourceRoute ||
    !targetRoute ||
    sourceRoute.runtimeEnvironmentId !== environmentId ||
    targetRoute.runtimeEnvironmentId !== environmentId ||
    sourceRoute.executionHostId !== targetRoute.executionHostId
  ) {
    throw new Error('remote_browser_document_owner_mismatch')
  }
  const retirementRequested = !!before.remoteBrowserPageHandlesByPageId[sourcePageId]
  const outcome = convert(location)
  if (outcome === 'failed') {
    throw new Error('remote_browser_document_conversion_failed')
  }
  const after = useAppStore.getState()
  const sourceIndex = (before.browserPagesByWorkspace[source.workspaceId] ?? []).findIndex(
    (page) => page.id === sourcePageId
  )
  const target =
    outcome === 'converted'
      ? after.browserPagesByWorkspace[source.workspaceId]?.[sourceIndex]
      : Object.values(after.browserPagesByWorkspace)
          .flat()
          .find(
            (page) =>
              browserPageDocLocationsEqual(page.docLocation ?? null, location) &&
              (after.browserTabsByWorktree[location.worktreeId] ?? []).some(
                (workspace) =>
                  workspace.id === page.workspaceId && workspace.activePageId === page.id
              )
          )
  if (
    !target ||
    !browserPageDocLocationsEqual(target.docLocation ?? null, location) ||
    (outcome === 'converted' &&
      (target.id === sourcePageId ||
        target.workspaceId !== source.workspaceId ||
        after.remoteBrowserPageHandlesByPageId[sourcePageId]))
  ) {
    throw new Error('remote_browser_document_effect_unconfirmed')
  }
  return {
    outcome,
    page: target.id,
    workspace: target.workspaceId,
    worktree: target.worktreeId,
    remoteRetirementRequested: outcome === 'converted' && retirementRequested
  }
}
