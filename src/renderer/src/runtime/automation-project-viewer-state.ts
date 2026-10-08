import type { AutomationProjectGroup } from '../components/automations/automation-project-groups'
import { getRepoExecutionHostId } from '../../../shared/execution-host'

export type AutomationProjectAddResult = {
  operation: 'added' | 'not-added'
  repoId: string | null
  selected: boolean
  workspaceRead: 'loaded' | 'failed' | 'not-requested'
}
export type AutomationProjectViewerForm = {
  routeKey: string
  open: boolean
  query: string
  commandValue: string
  value: string
  hostMenuProjectKey: string | null
  filteredGroups: readonly AutomationProjectGroup[]
  isAdding: boolean
  allowAddProject: boolean
  isInputFocused: () => boolean
  handleOpenChange: (open: boolean) => void
  setQuery: (query: string) => void
  setCommandValue: (value: string) => void
  handleSelect: (repoId: string) => void
  setHostMenuProjectKey: (key: string | null) => void
  setHostMenuHover: (key: string, region: 'row' | 'content', hovered: boolean) => Promise<void>
  focusSearchInput: () => Promise<boolean>
  handleAddFolder: (path?: string) => Promise<AutomationProjectAddResult>
}
export type AutomationProjectOutcome =
  | { action: 'add'; result: AutomationProjectAddResult; reviewStatus: 'current' | 'changed' }
  | { action: 'focus'; focused: boolean }
  | { action: 'host-hover'; operation: 'settled' }
export function automationProjectReviewScope(form: AutomationProjectViewerForm): string {
  return JSON.stringify([
    form.routeKey,
    form.open,
    form.query,
    form.commandValue,
    form.value,
    form.hostMenuProjectKey,
    form.filteredGroups.map((group) => [
      group.projectKey,
      group.sources.map((repo) => [repo.id, repo.path, getRepoExecutionHostId(repo)])
    ])
  ])
}
export function automationProjectFormSnapshot(
  form: AutomationProjectViewerForm,
  busy: boolean,
  reviewedTarget: string,
  outcome: AutomationProjectOutcome | null
) {
  return {
    committed: true as const,
    reviewedTarget,
    open: form.open,
    query: form.query,
    commandValue: form.commandValue,
    value: form.value,
    hostMenuProjectKey: form.hostMenuProjectKey,
    groups: form.filteredGroups.map((group) => ({
      key: group.projectKey,
      commandValue: group.repo.id,
      sources: group.sources.map((repo) => ({
        id: repo.id,
        name: repo.displayName,
        path: repo.path,
        hostId: getRepoExecutionHostId(repo)
      }))
    })),
    isAdding: form.isAdding,
    allowAddProject: form.allowAddProject,
    inputFocused: form.isInputFocused(),
    busy,
    outcome
  }
}
export type AutomationProjectViewerState = ReturnType<typeof automationProjectFormSnapshot>
