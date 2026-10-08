import { useLayoutEffect } from 'react'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { WorkspaceStatusDefinition } from '../../../shared/worktree/types'
import {
  publishWorkspaceBoardControl,
  publishWorkspaceBoardView,
  type WorkspaceBoardControl
} from './workspace-board-viewer-view'

export function useWorkspaceBoardViewerPublication(args: {
  open: boolean
  statuses: readonly WorkspaceStatusDefinition[]
  columnWidth: number
  control: WorkspaceBoardControl
}): void {
  const { open, statuses, columnWidth, control } = args
  const runtimeContextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  useLayoutEffect(() => {
    publishWorkspaceBoardView({
      runtimeContextKey,
      open,
      columnWidth,
      statuses: statuses.map((status) => ({ ...status }))
    })
    publishWorkspaceBoardControl(control)
  }, [runtimeContextKey, open, statuses, columnWidth, control])
  useLayoutEffect(
    () => () => {
      publishWorkspaceBoardView(null)
      publishWorkspaceBoardControl(null)
    },
    []
  )
}
