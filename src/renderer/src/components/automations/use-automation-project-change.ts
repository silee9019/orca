import { useCallback, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import { getDefaultWorktree } from './automation-draft-model'
import { getAutomationEditorWorktrees } from './automation-editor-worktrees'
import { revalidateAutomationCreateDestination } from './automation-create-destination'
import type { AutomationsPageStoreState } from './use-automations-page-store-state'
import type { AutomationsPageLocalState } from './use-automations-page-local-state'
import type { AutomationsPageDestinationState } from './use-automations-page-destination-state'
import type { AutomationsPageDestinationFormState } from './use-automations-page-destination-form'

type Context = {
  store: Pick<AutomationsPageStoreState, 'worktreesByRepo' | 'fetchWorktrees'>
  local: Pick<
    AutomationsPageLocalState,
    | 'createOpen'
    | 'createTarget'
    | 'editingExternalTarget'
    | 'editingAutomationId'
    | 'editingHostStableKey'
    | 'editRequestRef'
    | 'draftAtOpen'
    | 'setEditingDestination'
    | 'setEditingHostStableKey'
    | 'setDraft'
  >
  destination: Pick<AutomationsPageDestinationState, 'createDestination'>
  destinationForm: Pick<
    AutomationsPageDestinationFormState,
    'dialogRepos' | 'editHostResolution' | 'destinationForProject'
  >
}
function selectedDestination(context: Context) {
  if (context.local.createTarget !== 'orca' || context.local.editingExternalTarget !== null) {
    return null
  }
  return context.local.editingAutomationId === null
    ? context.destination.createDestination.control.resolution
    : context.destinationForm.editHostResolution
}
export function useAutomationProjectChange(context: Context): (projectId: string) => void {
  const latest = useRef(context)
  useLayoutEffect(() => {
    latest.current = context
  })
  return useCallback((projectId: string): void => {
    const current = latest.current
    const { local, store, destinationForm } = current
    const project = destinationForm.dialogRepos.find((repo) => repo.id === projectId)
    const selected = selectedDestination(current)
    if (!local.createOpen || !project || (selected && selected.status !== 'ready')) {
      return
    }
    const requestId = (local.editRequestRef.current += 1)
    const openingDraft = local.draftAtOpen
    const createTarget = local.createTarget
    const currentWorktrees = getAutomationEditorWorktrees(
      project,
      store.worktreesByRepo[projectId] ?? []
    )
    const initialWorkspace = getDefaultWorktree(currentWorktrees)
    const fetchOptions =
      selected?.status === 'ready' && selected.authority.kind === 'runtime'
        ? { executionHostId: toRuntimeExecutionHostId(selected.authority.environmentId) }
        : undefined
    if (local.editingAutomationId !== null) {
      const target = destinationForm.destinationForProject(projectId, local.editingHostStableKey)
      local.setEditingDestination(target ? { projectId, destination: target } : null)
      if (target) {
        local.setEditingHostStableKey(target.entry.stableKey)
      }
    }
    local.setDraft((draft) => ({
      ...draft,
      projectId,
      workspaceId: initialWorkspace?.id ?? '',
      baseBranch: ''
    }))
    void store.fetchWorktrees(projectId, fetchOptions).then(
      () => {
        const next = latest.current
        if (
          !next.local.createOpen ||
          next.local.editRequestRef.current !== requestId ||
          next.local.draftAtOpen !== openingDraft ||
          next.local.createTarget !== createTarget
        ) {
          return
        }
        const nextDestination = selectedDestination(next)
        if (selected?.status === 'ready') {
          if (
            nextDestination?.status !== 'ready' ||
            revalidateAutomationCreateDestination(selected, [nextDestination.entry]).status !==
              'ready'
          ) {
            return
          }
        } else if (nextDestination !== null) {
          return
        }
        const nextProject = next.destinationForm.dialogRepos.find((repo) => repo.id === projectId)
        const candidates = useAppStore.getState().worktreesByRepo[projectId] ?? []
        const workspace = getDefaultWorktree(getAutomationEditorWorktrees(nextProject, candidates))
        if (!workspace) {
          return
        }
        next.local.setDraft((draft) =>
          next.local.editRequestRef.current === requestId &&
          draft.projectId === projectId &&
          !draft.workspaceId
            ? { ...draft, workspaceId: workspace.id }
            : draft
        )
      },
      () => undefined
    )
  }, [])
}
