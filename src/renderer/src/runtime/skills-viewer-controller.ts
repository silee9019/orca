import { dialogClose, isSkillsViewerDialogOpen } from './skills-viewer-dialog'
export { useSkillsViewerDialog } from './skills-viewer-dialog'
import {
  applySkillsChildViewerAction,
  isSkillsChildViewerAction,
  requireSkillsChildViewerAvailable,
  type SkillsChildViewerState
} from './skills-child-viewer-actions'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { DiscoveredSkill } from '../../../shared/skills'
import type { SkillsFilterState, SkillsViewerAction } from '../../../shared/skills-viewer-command'
import { NO_SKILL_FILTERS, SkillsViewerActionSchema } from '../../../shared/skills-viewer-command'
import type { RuntimeClientTarget } from './runtime-client-target'

type Page = {
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
}
function snapshot(page: Page) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
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
type ViewerState = ReturnType<typeof snapshot> & SkillsChildViewerState
type Control = (action: SkillsViewerAction) => Promise<ViewerState>
const mountedViewers = new Set<Control>()
export async function applySkillsViewerAction(action: SkillsViewerAction): Promise<ViewerState> {
  const parsed = SkillsViewerActionSchema.parse(action)
  if (mountedViewers.size !== 1) {
    throw new Error(mountedViewers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedViewers.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useSkillsViewerController(page: Page): void {
  const latest = useRef(page)
  useLayoutEffect(() => {
    latest.current = page
  })
  const [, setRevision] = useState(0)
  const pending = useRef<{
    target: RuntimeClientTarget | null
    refresh: boolean
    ready: boolean
    resolve: (state: ViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    if (request.target !== page.target) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (request.ready && (!request.refresh || !page.loading)) {
      pending.current = null
      if (request.refresh && page.error) {
        request.reject(new Error('skills_refresh_failed'))
      } else {
        request.resolve(snapshot(page))
      }
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (
        isSkillsViewerDialogOpen('freshness') &&
        action.kind !== 'freshness-form' &&
        (!isSkillsChildViewerAction(action) || action.action.kind !== 'get')
      ) {
        throw new Error('viewer_modal_open')
      }
      if (isSkillsChildViewerAction(action)) {
        requireSkillsChildViewerAvailable(action, current)
        const dialog = await applySkillsChildViewerAction(action)
        return { ...snapshot(latest.current), ...dialog }
      }
      if (isSkillsViewerDialogOpen('detail')) {
        throw new Error('viewer_modal_open')
      }
      if (action.kind === 'share' && !action.open && current.shareSkills.length) {
        const share = await applySkillsChildViewerAction({
          kind: 'share-form',
          action: { kind: 'close' }
        })
        return { ...snapshot(latest.current), ...share }
      }
      if (pending.current) {
        throw new Error('viewer_busy')
      }
      if (!current.target) {
        throw new Error('skill_owner_unavailable')
      }
      if (
        action.kind === 'filter' &&
        action.value.agent !== 'all' &&
        !current.agents.includes(action.value.agent)
      ) {
        throw new Error('skill_agent_not_loaded')
      }
      if (action.kind === 'mode' && action.value === 'delete' && !current.deleteSupported) {
        throw new Error('skill_delete_unsupported')
      }
      let selection: Set<string> | undefined
      if (action.kind === 'select' || action.kind === 'select-visible') {
        if (!current.mode || current.view !== 'skills' || current.loading) {
          throw new Error('skill_selection_unavailable')
        }
        const requested =
          action.kind === 'select-visible'
            ? current.visibleSkills
            : current.visibleSkills.filter((skill) => action.ids.includes(skill.id))
        if (action.kind === 'select' && new Set(action.ids).size !== requested.length) {
          throw new Error('skill_not_visible')
        }
        selection =
          action.kind === 'select' && !action.selected
            ? new Set([...current.selectedIds].filter((id) => !action.ids.includes(id)))
            : current.addSelected(current.selectedIds, requested)
        if (
          action.kind === 'select' &&
          action.selected &&
          action.ids.some((id) => !selection?.has(id))
        ) {
          throw new Error('skill_selection_ineligible')
        }
      }
      let sharing: DiscoveredSkill[] | undefined
      if (action.kind === 'share' && action.open && !current.shareSkills.length) {
        const ids = action.ids ?? [...current.selectedIds]
        sharing = current.shareSelection(ids)
        if (
          current.loading ||
          !ids.length ||
          new Set(ids).size !== ids.length ||
          sharing.length !== ids.length
        ) {
          throw new Error('skill_selection_ineligible')
        }
      }
      let closeDialog: (() => void) | undefined
      if (current.installOpen || current.managementOpen || current.shareSkills.length) {
        const kind = current.installOpen
          ? 'install'
          : current.managementOpen
            ? 'management'
            : 'share'
        if (
          (action.kind !== 'install' && action.kind !== 'management' && action.kind !== 'share') ||
          action.kind !== kind
        ) {
          throw new Error('viewer_modal_open')
        }
        if (action.open) {
          if (
            (action.kind === 'install' && action.link !== undefined) ||
            (action.kind === 'share' && action.ids !== undefined)
          ) {
            throw new Error('viewer_modal_open')
          }
          return snapshot(current)
        }
        closeDialog = dialogClose(kind)
      }
      if (action.kind === 'refresh' && current.loading) {
        throw new Error('viewer_busy')
      }
      return new Promise((resolve, reject) => {
        const request = {
          target: current.target,
          refresh: action.kind === 'refresh',
          ready: true,
          resolve,
          reject
        }
        pending.current = request
        switch (action.kind) {
          case 'filter':
            current.setFilters(action.value)
            break
          case 'filter-clear':
            current.setFilters(NO_SKILL_FILTERS)
            break
          case 'view':
            current.changeView(action.value)
            break
          case 'mode':
            current.setMode(action.value)
            current.setSelectedIds(new Set())
            break
          case 'select':
          case 'select-visible':
            if (selection) {
              current.setSelectedIds(selection)
            }
            break
          case 'clear-selection':
            current.setSelectedIds(new Set())
            break
          case 'share':
            if (closeDialog) {
              closeDialog()
            } else {
              current.setShareSkills(action.open ? (sharing ?? []) : [])
            }
            break
          case 'management':
            if (closeDialog) {
              closeDialog()
            } else {
              current.setManagementOpen(action.open)
            }
            break
          case 'install':
            if (closeDialog) {
              closeDialog()
            } else {
              current.setInstallLink(action.open ? (action.link ?? '') : '')
              current.setInstallOpen(action.open)
            }
            break
          case 'refresh':
            request.ready = false
            void current.refresh().then(
              () => {
                if (pending.current !== request) {
                  return
                }
                request.ready = true
                setRevision((value) => value + 1)
              },
              (error: unknown) => {
                if (pending.current !== request) {
                  return
                }
                pending.current = null
                reject(error instanceof Error ? error : new Error('skills_refresh_failed'))
              }
            )
            return
        }
        setRevision((value) => value + 1)
      })
    }
    mountedViewers.add(control)
    return () => {
      mountedViewers.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
