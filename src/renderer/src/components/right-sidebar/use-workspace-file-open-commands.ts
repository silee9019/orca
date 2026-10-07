import { getActivatableBrowserWorkspaceTab } from '@/lib/browser-workspace-tab-activation'
import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import {
  getKnownExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree
} from '@/lib/worktree-runtime-owner'
import type { WorkspaceFilePreviewPlan } from '@/lib/file-preview'
import { WorkspaceFileOpenEvent } from '@/runtime/workspace-file-open-request'
import type { TreeNode } from './file-explorer-types'
type Owner = {
  node: TreeNode
  worktreeId: string | null
  enabled: boolean
  open: () => WorkspaceFilePreviewPlan | undefined
}
export function useWorkspaceFileOpenCommands(owner: Owner): void {
  const latest = useRef(owner)
  useEffect(() => {
    latest.current = owner
  }, [owner])
  useEffect(() => {
    let mounted = true
    const listener = (event: Event) => {
      if (!(event instanceof WorkspaceFileOpenEvent)) {
        return
      }
      const command = event.command
      const current = latest.current
      if (
        !current.enabled ||
        current.node.isDirectory ||
        current.node.path !== command.filePath ||
        current.worktreeId !== command.worktreeId
      ) {
        return
      }
      event.offers.push(() => {
        const owner = latest.current
        const state = useAppStore.getState()
        if (state.activeModal !== 'none') {
          throw new Error('workspace_file_viewer_busy')
        }
        const source = owner.node.operationOwner
        const host =
          source?.kind === 'local'
            ? 'local'
            : source?.kind === 'ssh'
              ? `ssh:${source.connectionId}`
              : source?.kind === 'runtime'
                ? source.executionHostId
                : null
        if (
          !mounted ||
          Date.now() >= event.expiresAt ||
          !owner.enabled ||
          owner.node.isDirectory ||
          owner.node.path !== command.filePath ||
          owner.worktreeId !== command.worktreeId ||
          state.activeWorktreeId !== command.worktreeId ||
          getKnownExecutionHostIdForWorktree(state, command.worktreeId) !==
            command.executionHostId ||
          !state.getKnownWorktreeById(
            command.worktreeId,
            state.activeWorkspaceExecutionHostId ?? undefined
          ) ||
          (source?.kind === 'runtime' &&
            source.environmentId !==
              getRuntimeEnvironmentIdForWorktree(state, command.worktreeId)) ||
          host !== command.executionHostId
        ) {
          throw new Error('workspace_file_owner_changed')
        }
        const before = new Set(
          Object.values(state.browserPagesByWorkspace)
            .flat()
            .map((page) => page.id)
        )
        const result = owner.open()
        if (!result || result.status === 'unsupported') {
          throw new Error(result?.message ?? 'workspace_file_open_unavailable')
        }
        const applied = useAppStore.getState()
        const pages = Object.values(applied.browserPagesByWorkspace)
          .flat()
          .filter(
            (page) =>
              page.worktreeId === command.worktreeId &&
              (result.status === 'browser-tab'
                ? !before.has(page.id) && page.url === result.url
                : page.docLocation?.kind === 'workspace-doc' &&
                  page.docLocation.filePath === command.filePath &&
                  page.docLocation.worktreeId === command.worktreeId)
          )
        const page = pages.find((page) =>
          applied.browserTabsByWorktree[command.worktreeId]?.some(
            (tab) => tab.id === page.workspaceId && tab.activePageId === page.id
          )
        )
        const tab =
          page &&
          getActivatableBrowserWorkspaceTab({
            worktreeId: command.worktreeId,
            workspaceId: page.workspaceId,
            executionHostId: applied.activeWorkspaceExecutionHostId ?? undefined
          })
        if (
          !page ||
          !tab ||
          applied.groupsByWorktree[command.worktreeId]?.find((group) => group.id === tab.groupId)
            ?.activeTabId !== tab.id ||
          Date.now() >= event.expiresAt ||
          getKnownExecutionHostIdForWorktree(applied, command.worktreeId) !==
            command.executionHostId
        ) {
          throw new Error('workspace_file_open_applied_unknown')
        }
        return { ...command, mode: result.status, pageId: page.id, workspaceId: page.workspaceId }
      })
    }
    window.addEventListener('orca:workspace-file-open', listener)
    return () => {
      mounted = false
      window.removeEventListener('orca:workspace-file-open', listener)
    }
  }, [])
}
