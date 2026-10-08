import { useSkillDiscoveryScan } from './use-skill-discovery-scan'
import { useSkillsViewerController } from '../../runtime/skills-viewer-controller'
import { NO_SKILL_FILTERS } from '../../../../shared/skills-viewer-command'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Share2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useActiveSkillDiscoveryRuntimeTarget } from '@/hooks/use-active-skill-discovery-runtime-target'
import type { DiscoveredSkill } from '../../../../shared/skills'
import { MAX_SKILL_DELETE_BATCH } from '../../../../shared/skill-delete-contract'
import { SkillsList } from './SkillsList'
import { SkillShareDialog } from './SkillShareDialog'
import { SkillInstallDialog } from './SkillInstallDialog'
import { SkillInstallManagementDialog } from './SkillInstallManagementDialog'
import { SkillsPageHeader } from './SkillsPageHeader'
import { SkillsFilterToolbar } from './SkillsFilterToolbar'
import { SkillsSelectionHeader } from './SkillsSelectionHeader'
import {
  SkillsEmptyState,
  SkillsListSkeleton,
  SkillsNoMatchesState,
  SkillsRemoteShareNotice,
  SkillsScanErrorBand
} from './skills-page-states'
import { SKILLS_PAGE_COLUMN } from './skills-page-column'
import { scannedSkillSourceCount, summarizeSkillSources } from './skill-source-inventory'
import { useSkillDiscoveryHostLabel } from './use-skill-discovery-host-label'
import { countSkillsBySource, filterSkills, type SkillsFilterState } from './skills-filter'
import { skillAgentByRootPath, skillAgentOptions } from './skill-agent-filter'
import { SkillSharedLinksView, matchesSkillShareQuery } from './SkillSharedLinksView'
import { useOwnedSkillShares } from './use-owned-skill-shares'
import type { SkillsPageView } from './skills-page-view'
import { useSkillsPageKeyboardNavigation } from './use-skills-page-keyboard-navigation'
import { translate } from '@/i18n/i18n'
import {
  INSTALLED_AGENT_SKILLS_CHANGED_EVENT,
  INSTALLED_AGENT_SKILLS_REFRESHED_EVENT
} from '@/hooks/installed-agent-skills-change-event'
import {
  addShareableSkillResults,
  eligibleShareSkillCount,
  updatedSkillSelection
} from './skill-share-selection'
import { addDeletableSkillResults, eligibleDeleteSkillCount } from './skill-delete-selection'
import { skillDeleteActionLabel } from './skill-delete-copy'
import { shareSelectionActionLabel } from './skill-display-labels'
import { SkillDeleteResultBand } from './SkillDeleteResultBand'
import { useSkillDeleteFlow } from './use-skill-delete-flow'

const EMPTY_SKILLS: DiscoveredSkill[] = []
const NO_FILTERS = NO_SKILL_FILTERS

export default function SkillsPage(): React.JSX.Element {
  const closeSkillsPage = useAppStore((s) => s.closeSkillsPage)
  const pendingSkillShareId = useAppStore((s) => s.pendingSkillShareId)
  const clearPendingSkillShare = useAppStore((s) => s.clearPendingSkillShare)
  const pendingSkillsSharedView = useAppStore((s) => s.pendingSkillsSharedView)
  const clearPendingSkillsSharedView = useAppStore((s) => s.clearPendingSkillsSharedView)
  const runtimeTarget = useActiveSkillDiscoveryRuntimeTarget()
  const hostLabel = useSkillDiscoveryHostLabel(runtimeTarget)
  const [shareSkills, setShareSkills] = useState<DiscoveredSkill[]>([])
  const [selectionMode, setSelectionMode] = useState<'share' | 'delete' | null>(null)
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set())
  const [installOpen, setInstallOpen] = useState(false)
  const [installLink, setInstallLink] = useState('')
  const [managementOpen, setManagementOpen] = useState(false)
  const [filters, setFilters] = useState<SkillsFilterState>(NO_FILTERS)
  const [view, setView] = useState<SkillsPageView>('skills')
  const ownedShares = useOwnedSkillShares()
  const { result, loading, scanError, loadSkills } = useSkillDiscoveryScan(
    runtimeTarget,
    selectionMode,
    setSelectedSkillIds
  )

  useEffect(() => {
    const refresh = (): void => void loadSkills()
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refresh)
  }, [loadSkills])

  useEffect(() => {
    if (pendingSkillsSharedView) {
      setView('shared')
      setFilters(NO_FILTERS)
      clearPendingSkillsSharedView()
    }
  }, [clearPendingSkillsSharedView, pendingSkillsSharedView])

  useEffect(() => {
    if (!pendingSkillShareId) {
      return
    }
    setInstallLink(`https://app.orca.dev/skills/share/${pendingSkillShareId}`)
    setInstallOpen(true)
    clearPendingSkillShare()
  }, [clearPendingSkillShare, pendingSkillShareId])

  const exitSelection = useCallback((): void => {
    setSelectionMode(null)
    setSelectedSkillIds(new Set())
  }, [])

  const deleteFlow = useSkillDeleteFlow(runtimeTarget, hostLabel, () => {
    exitSelection()
    // Why an explicit refresh instead of firing the change event: this page
    // would then run a second, non-refresh scan of the host it just refreshed.
    // Other subscribers (settings badges, pickers) still hear the event.
    void loadSkills(true)
    window.dispatchEvent(new Event(INSTALLED_AGENT_SKILLS_REFRESHED_EVENT))
  })

  // Why: the search box is shared between the two lists, but a link query means
  // nothing against skill names and vice versa.
  const exitSharedLinks = useCallback((): void => {
    setView('skills')
    setFilters(NO_FILTERS)
  }, [])

  const openSharedLinks = useCallback((): void => {
    setView('shared')
    setFilters(NO_FILTERS)
  }, [])

  useSkillsPageKeyboardNavigation({
    closeSkillsPage,
    exitSelection,
    exitSharedLinks,
    selectionMode,
    view
  })

  const skills = result?.skills ?? EMPTY_SKILLS
  const local = runtimeTarget?.kind === 'local'
  const agentByRootPath = useMemo(() => skillAgentByRootPath(result), [result])
  const agentOptions = useMemo(() => skillAgentOptions(result), [result])
  const visibleSkills = useMemo(
    () => filterSkills(skills, filters, agentByRootPath),
    [agentByRootPath, filters, skills]
  )
  const sourceCounts = useMemo(() => countSkillsBySource(skills), [skills])
  const sourceEntries = useMemo(() => summarizeSkillSources(result), [result])
  const eligibleCount =
    selectionMode === 'delete'
      ? eligibleDeleteSkillCount(visibleSkills)
      : eligibleShareSkillCount(visibleSkills, local)
  const deleting = selectionMode === 'delete'
  const addSelected = (
    current: ReadonlySet<string>,
    results: readonly DiscoveredSkill[]
  ): Set<string> =>
    deleting
      ? addDeletableSkillResults(current, skills, results)
      : addShareableSkillResults(current, skills, results, local)
  const openInstallDialog = (): void => {
    setInstallLink('')
    setInstallOpen(true)
  }

  useSkillsViewerController({
    target: runtimeTarget,
    filters,
    setFilters,
    agents: agentOptions.map((agent) => agent.id),
    visibleSkills,
    visibleShareIds: ownedShares.error
      ? []
      : ownedShares.shares
          .filter((share) => matchesSkillShareQuery(share.name, filters.query))
          .map((share) => share.id),
    selectedIds: selectedSkillIds,
    setSelectedIds: setSelectedSkillIds,
    mode: selectionMode,
    setMode: setSelectionMode,
    deleteSupported: deleteFlow.supported,
    addSelected,
    view,
    changeView: (next) => (next === 'shared' ? openSharedLinks() : exitSharedLinks()),
    installOpen,
    setInstallOpen,
    setInstallLink,
    managementOpen,
    setManagementOpen,
    shareSkills,
    setShareSkills,
    shareSelection: (ids) => {
      const matches = skills.filter((skill) => ids.includes(skill.id))
      const eligible = addShareableSkillResults(new Set(), skills, matches, local)
      return matches.filter((skill) => eligible.has(skill.id))
    },
    loading: view === 'shared' ? ownedShares.loading : loading,
    error: view === 'shared' ? ownedShares.error !== null : scanError !== null,
    refresh: async () => {
      if (view === 'shared') {
        await ownedShares.refresh()
      } else {
        deleteFlow.reprobe()
        await loadSkills()
      }
    }
  })

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-background">
      {selectionMode ? (
        <SkillsSelectionHeader
          title={
            deleting
              ? translate(
                  'auto.components.skills.SkillsSelectionHeader.deleteTitle',
                  'Select skills to delete'
                )
              : translate(
                  'auto.components.skills.SkillsSelectionHeader.title',
                  'Select skills to share'
                )
          }
          icon={
            deleting ? (
              <Trash2 className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Share2 className="size-4 shrink-0 text-muted-foreground" />
            )
          }
          actionIcon={deleting ? <Trash2 className="size-3.5" /> : <Share2 className="size-3.5" />}
          actionLabel={
            deleting
              ? skillDeleteActionLabel(selectedSkillIds.size)
              : shareSelectionActionLabel(selectedSkillIds.size)
          }
          destructive={deleting}
          busy={deleting && deleteFlow.running}
          selectedCount={selectedSkillIds.size}
          eligibleCount={eligibleCount}
          onSelectAll={() => setSelectedSkillIds((current) => addSelected(current, visibleSkills))}
          onClear={() => setSelectedSkillIds(new Set())}
          onCancel={exitSelection}
          onSubmit={() => {
            const selected = skills.filter((skill) => selectedSkillIds.has(skill.id))
            if (deleting) {
              void deleteFlow.requestDelete(selected)
              return
            }
            setShareSkills(selected)
          }}
        />
      ) : (
        <SkillsPageHeader
          skillCount={skills.length}
          sourceEntries={sourceEntries}
          scannedSourceCount={scannedSkillSourceCount(sourceEntries)}
          hostLabel={hostLabel}
          onClose={closeSkillsPage}
          onStartShare={() => {
            setSelectionMode('share')
            setSelectedSkillIds(new Set())
          }}
          deleteSupported={deleteFlow.supported}
          deleteUnsupportedReason={deleteFlow.unsupportedReason}
          onStartDelete={() => {
            setSelectionMode('delete')
            setSelectedSkillIds(new Set())
          }}
          onInstallFromLink={openInstallDialog}
          onManageInstalls={() => setManagementOpen(true)}
          onOpenSharedLinks={openSharedLinks}
        />
      )}
      <SkillsFilterToolbar
        view={view}
        filters={filters}
        agentOptions={agentOptions}
        sourceCounts={sourceCounts}
        totalCount={skills.length}
        resultCount={visibleSkills.length}
        linkCount={ownedShares.shares.length}
        loading={view === 'shared' ? ownedShares.loading : loading}
        onViewChange={(next) => (next === 'shared' ? openSharedLinks() : exitSharedLinks())}
        onFiltersChange={setFilters}
        onRefresh={() => {
          if (view === 'shared') {
            ownedShares.refresh()
            return
          }
          deleteFlow.reprobe()
          void loadSkills()
        }}
      />
      {scanError ? (
        <SkillsScanErrorBand
          detail={scanError.detail}
          disabled={loading}
          onRetry={() => {
            deleteFlow.reprobe()
            void loadSkills()
          }}
        />
      ) : null}
      {deleteFlow.result ? (
        <SkillDeleteResultBand result={deleteFlow.result} onDismiss={deleteFlow.dismissResult} />
      ) : null}

      <section className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <div className={cn(SKILLS_PAGE_COLUMN, 'py-2')} data-skills-page-list="true">
          {view === 'shared' ? (
            <SkillSharedLinksView query={filters.query} shares={ownedShares} />
          ) : (
            <>
              {hostLabel && !local ? <SkillsRemoteShareNotice hostLabel={hostLabel} /> : null}
              {loading && skills.length === 0 ? (
                <SkillsListSkeleton />
              ) : visibleSkills.length > 0 ? (
                <SkillsList
                  skills={visibleSkills}
                  target={runtimeTarget}
                  busy={loading}
                  locked={installOpen || managementOpen || shareSkills.length > 0}
                  allSkills={skills}
                  local={local}
                  agentByRootPath={agentByRootPath}
                  selectedIds={selectedSkillIds}
                  selectionMode={selectionMode}
                  deleteSupported={deleteFlow.supported}
                  deleteUnsupportedReason={deleteFlow.unsupportedReason}
                  onSelectedChange={(skillId, selected) =>
                    setSelectedSkillIds((current) =>
                      updatedSkillSelection(
                        current,
                        skillId,
                        selected,
                        selectionMode === 'delete' ? MAX_SKILL_DELETE_BATCH : undefined
                      )
                    )
                  }
                  onSelectResults={(results) =>
                    setSelectedSkillIds((current) => addSelected(current, results))
                  }
                  onShare={(skill) => setShareSkills([skill])}
                  onDelete={(skill) => void deleteFlow.requestDelete([skill])}
                />
              ) : skills.length > 0 ? (
                <SkillsNoMatchesState onClearFilters={() => setFilters(NO_FILTERS)} />
              ) : result ? (
                <SkillsEmptyState
                  onRefresh={() => {
                    deleteFlow.reprobe()
                    void loadSkills()
                  }}
                  onInstallFromLink={openInstallDialog}
                />
              ) : null}
            </>
          )}
        </div>
      </section>

      <SkillShareDialog
        skills={shareSkills}
        open={shareSkills.length > 0}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setShareSkills([])
            exitSelection()
          }
        }}
      />
      <SkillInstallDialog
        key={installLink || 'manual-install'}
        open={installOpen}
        initialLink={installLink}
        onOpenChange={(next) => {
          setInstallOpen(next)
          if (!next) {
            setInstallLink('')
          }
        }}
      />
      <SkillInstallManagementDialog open={managementOpen} onOpenChange={setManagementOpen} />
    </main>
  )
}
