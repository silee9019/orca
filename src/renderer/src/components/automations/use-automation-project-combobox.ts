import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { isRepoSearchQueryTooLarge, searchRepos } from '@/lib/repo-search'
import { getActiveRuntimeTarget } from '../../runtime/runtime-client-target'
import { useAutomationProjectViewerController } from '../../runtime/automation-project-viewer-controller'
import type { AutomationProjectAddResult } from '../../runtime/automation-project-viewer-state'
import type { AutomationProjectComboboxProps } from './AutomationProjectCombobox'
import {
  getAutomationProjectGroups,
  getAutomationProjectGroupForRepo,
  getAutomationProjectSelectedSource,
  hasMultipleHosts
} from './automation-project-groups'

function currentAddRoute(): string {
  const state = useAppStore.getState()
  return JSON.stringify([state.activeOrcaProfileId, getActiveRuntimeTarget(state.settings)])
}
export function useAutomationProjectCombobox({
  repos,
  value,
  onValueChange,
  allowAddProject = true
}: Pick<AutomationProjectComboboxProps, 'repos' | 'value' | 'onValueChange' | 'allowAddProject'>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [commandValue, setCommandValue] = useState('')
  const [hostMenuProjectKey, setHostMenuProjectKey] = useState<string | null>(null)
  const hostMenuCloseTimerRef = useRef<number | null>(null)
  const hostMenuHoverRef = useRef<{
    projectKey: string | null
    row: boolean
    content: boolean
  }>({ projectKey: null, row: false, content: false })
  const settings = useAppStore((s) => s.settings)
  const profileId = useAppStore((s) => s.activeOrcaProfileId)
  const routeKey = JSON.stringify([profileId, getActiveRuntimeTarget(settings)])
  const routeRevision = useRef({ key: routeKey, revision: 0 })
  useLayoutEffect(() => {
    if (routeRevision.current.key !== routeKey) {
      routeRevision.current = { key: routeKey, revision: routeRevision.current.revision + 1 }
    }
  }, [routeKey])
  const addRepoPath = useAppStore((s) => s.addRepoPath)
  const focusResolveRef = useRef<((focused: boolean) => void) | null>(null)
  const hostCloseResolveRef = useRef<(() => void) | null>(null)
  const addRepo = useAppStore((s) => s.addRepo)
  const fetchWorktrees = useAppStore((s) => s.fetchWorktrees)
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()

  const groups = useMemo(() => getAutomationProjectGroups(repos, value), [repos, value])
  const selectedGroup = useMemo(
    () => getAutomationProjectGroupForRepo(groups, value),
    [groups, value]
  )
  const selectedRepo = selectedGroup
    ? getAutomationProjectSelectedSource(selectedGroup, value)
    : null
  const showHostLabels = useMemo(() => hasMultipleHosts(repos), [repos])
  const filteredGroups = useMemo(() => {
    if (isRepoSearchQueryTooLarge(query)) {
      return []
    }
    const trimmed = query.trim()
    if (!trimmed) {
      return groups
    }
    return groups.filter((group) => searchRepos(group.sources, trimmed).length > 0)
  }, [groups, query])

  const cancelFocusFrame = useCallback((): void => {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current)
      focusFrameRef.current = null
    }
    focusResolveRef.current?.(false)
    focusResolveRef.current = null
  }, [])

  const setInputNode = useCallback(
    (node: HTMLInputElement | null): void => {
      if (node === null) {
        cancelFocusFrame()
      }
      inputRef.current = node
    },
    [cancelFocusFrame]
  )

  const focusSearchInput = useCallback(() => {
    cancelFocusFrame()
    return new Promise<boolean>((resolve) => {
      focusResolveRef.current = resolve
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = null
        inputRef.current?.focus()
        focusResolveRef.current = null
        resolve(inputRef.current !== null && document.activeElement === inputRef.current)
      })
    })
  }, [cancelFocusFrame])

  const clearHostMenuCloseTimer = useCallback(() => {
    if (hostMenuCloseTimerRef.current !== null) {
      window.clearTimeout(hostMenuCloseTimerRef.current)
      hostMenuCloseTimerRef.current = null
    }
    hostCloseResolveRef.current?.()
    hostCloseResolveRef.current = null
  }, [])

  const resetHostMenuHover = useCallback(() => {
    hostMenuHoverRef.current = { projectKey: null, row: false, content: false }
  }, [])

  const setHostMenuHover = useCallback(
    async (projectKey: string, region: 'row' | 'content', hovered: boolean): Promise<void> => {
      clearHostMenuCloseTimer()
      if (hostMenuHoverRef.current.projectKey !== projectKey) {
        hostMenuHoverRef.current = { projectKey, row: false, content: false }
      }
      hostMenuHoverRef.current[region] = hovered
      if (hovered) {
        setHostMenuProjectKey(projectKey)
        return
      }
      await new Promise<void>((resolve) => {
        hostCloseResolveRef.current = resolve
        hostMenuCloseTimerRef.current = window.setTimeout(() => {
          const hover = hostMenuHoverRef.current
          if (hover.projectKey === projectKey && !hover.row && !hover.content) {
            setHostMenuProjectKey((current) => (current === projectKey ? null : current))
            resetHostMenuHover()
          }
          hostMenuCloseTimerRef.current = null
          hostCloseResolveRef.current = null
          resolve()
        }, 100)
      })
    },
    [clearHostMenuCloseTimer, resetHostMenuHover]
  )

  useEffect(() => clearHostMenuCloseTimer, [clearHostMenuCloseTimer])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        setCommandValue(value)
        return
      }
      cancelFocusFrame()
      setQuery('')
      setHostMenuProjectKey(null)
      resetHostMenuHover()
    },
    [cancelFocusFrame, resetHostMenuHover, value]
  )

  const handleSelect = useCallback(
    (repoId: string) => {
      onValueChange(repoId)
      setOpen(false)
      setQuery('')
      setHostMenuProjectKey(null)
      resetHostMenuHover()
    },
    [onValueChange, resetHostMenuHover]
  )

  const handleAddFolder = useCallback(
    async (path?: string): Promise<AutomationProjectAddResult> => {
      if (isAdding) {
        throw new Error('viewer_busy')
      }
      if (
        path !== undefined &&
        getActiveRuntimeTarget(useAppStore.getState().settings).kind !== 'local'
      ) {
        throw new Error('automation_project_add_unavailable')
      }
      const route = currentAddRoute()
      const revision = routeRevision.current.revision
      setIsAdding(true)
      try {
        const repo = await (path === undefined
          ? addRepo()
          : addRepoPath(path, 'git', { runtimeEnvironmentId: null }))
        if (!repo) {
          return {
            operation: 'not-added',
            repoId: null,
            selected: false,
            workspaceRead: 'not-requested'
          }
        }
        if (isGitRepoKind(repo)) {
          try {
            await fetchWorktrees(repo.id)
          } catch {
            return { operation: 'added', repoId: repo.id, selected: false, workspaceRead: 'failed' }
          }
        }
        if (
          !mountedRef.current ||
          (path !== undefined &&
            (currentAddRoute() !== route || routeRevision.current.revision !== revision))
        ) {
          return {
            operation: 'added',
            repoId: repo.id,
            selected: false,
            workspaceRead: isGitRepoKind(repo) ? 'loaded' : 'not-requested'
          }
        }
        handleSelect(repo.id)
        return {
          operation: 'added',
          repoId: repo.id,
          selected: true,
          workspaceRead: isGitRepoKind(repo) ? 'loaded' : 'not-requested'
        }
      } finally {
        if (mountedRef.current) {
          setIsAdding(false)
        }
      }
    },
    [addRepo, addRepoPath, fetchWorktrees, handleSelect, isAdding, mountedRef]
  )
  useEffect(
    () => () => {
      cancelFocusFrame()
      clearHostMenuCloseTimer()
    },
    [cancelFocusFrame, clearHostMenuCloseTimer]
  )
  useAutomationProjectViewerController({
    routeKey,
    open,
    query,
    commandValue,
    value,
    hostMenuProjectKey,
    filteredGroups,
    isAdding,
    allowAddProject,
    isInputFocused: () => inputRef.current !== null && inputRef.current === document.activeElement,
    handleOpenChange,
    setQuery,
    setCommandValue,
    handleSelect,
    setHostMenuProjectKey,
    setHostMenuHover,
    focusSearchInput,
    handleAddFolder
  })
  return {
    open,
    query,
    commandValue,
    hostMenuProjectKey,
    isAdding,
    selectedRepo,
    showHostLabels,
    filteredGroups,
    handleOpenChange,
    handleSelect,
    handleAddFolder,
    focusSearchInput,
    setInputNode,
    setQuery,
    setCommandValue,
    setHostMenuHover,
    setHostMenuProjectKey
  }
}
