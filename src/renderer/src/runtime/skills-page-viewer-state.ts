import type { SkillDeleteResult } from '../../../shared/skill-delete-contract'
import { skillDeletionConfirmationSnapshot } from './skill-delete-viewer-confirmation'
import type { DiscoveredSkill } from '../../../shared/skills'
import type { SkillsFilterState } from '../../../shared/skills-viewer-command'
import type { RuntimeClientTarget } from './runtime-client-target'
import { isSkillsViewerDialogOpen } from './skills-viewer-dialog'

export type SkillsViewerPage = {
  target: RuntimeClientTarget | null
  filters: SkillsFilterState
  setFilters: (value: SkillsFilterState) => void
  agents: readonly string[]
  visibleSkills: readonly DiscoveredSkill[]
  visibleShareIds: readonly string[]
  selectedIds: ReadonlySet<string>
  setSelectedIds: (value: Set<string>) => void
  mode: 'share' | 'delete' | null
  setMode: (value: 'share' | 'delete' | null) => void
  deleteSupported: boolean
  addSelected: (current: ReadonlySet<string>, skills: readonly DiscoveredSkill[]) => Set<string>
  view: 'skills' | 'shared'
  changeView: (value: 'skills' | 'shared') => void
  installOpen: boolean
  setInstallOpen: (value: boolean) => void
  setInstallLink: (value: string) => void
  shareSkills: readonly DiscoveredSkill[]
  setShareSkills: (value: DiscoveredSkill[]) => void
  shareSelection: (ids: readonly string[]) => DiscoveredSkill[]
  managementOpen: boolean
  setManagementOpen: (value: boolean) => void
  loading: boolean
  error: boolean
  refresh: () => Promise<void>
  deleteSelected: () => Promise<boolean>
  deleteRunning: boolean
  deleteResult: SkillDeleteResult | null
  dismissDeleteResult: () => void
  close: () => void
}
export function skillsViewerSnapshot(page: SkillsViewerPage) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    closed: false,
    busy: page.deleteRunning,
    deleteResult: page.deleteResult,
    deletionConfirmation: skillDeletionConfirmationSnapshot(),
    target: page.target,
    filters: page.filters,
    visibleSkillIds: page.view === 'skills' ? page.visibleSkills.map((skill) => skill.id) : [],
    visibleShareIds: page.view === 'shared' ? page.visibleShareIds : [],
    selectedSkillIds: [...page.selectedIds],
    selectionMode: page.mode,
    view: page.view,
    installOpen: page.installOpen,
    managementOpen: page.managementOpen,
    shareOpen: page.shareSkills.length > 0,
    detailOpen: isSkillsViewerDialogOpen('detail'),
    freshnessOpen: isSkillsViewerDialogOpen('freshness'),
    sharedSkillIds: page.shareSkills.map((skill) => skill.id),
    loading: page.loading,
    error: page.error
  }
}
