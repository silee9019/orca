import { useLayoutEffect } from 'react'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { WorkspaceStatusDefinition } from '../../../shared/worktree/types'
import type { WorkspaceBoardWorkspace } from '../../../shared/workspace-board-command'
import {
  publishWorkspaceBoardControl,
  publishWorkspaceBoardView,
  type WorkspaceBoardControl
} from './workspace-board-viewer-view'

export function useWorkspaceBoardViewerPublication(args: {
  open: boolean
  statuses: readonly WorkspaceStatusDefinition[]
  columnWidth: number
  workspaces: readonly WorkspaceBoardWorkspace[]
  taskStatusSyncEnabled: boolean
  control: WorkspaceBoardControl
}): void {
  const { open, statuses, columnWidth, workspaces, taskStatusSyncEnabled, control } = args
  const runtimeContextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  useLayoutEffect(() => {
    publishWorkspaceBoardView({
      runtimeContextKey,
      open,
      columnWidth,
      statuses: statuses.map((status) => ({ ...status })),
      workspaces: workspaces.map((workspace) => ({ ...workspace })),
      taskStatusSyncEnabled
    })
    publishWorkspaceBoardControl(control)
  }, [runtimeContextKey, open, statuses, columnWidth, workspaces, taskStatusSyncEnabled, control])
  useLayoutEffect(
    () => () => {
      publishWorkspaceBoardView(null)
      publishWorkspaceBoardControl(null)
    },
    []
  )
}
