import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  AutomationWorkspaceViewerActionSchema,
  type AutomationWorkspaceViewerAction
} from '../../../shared/automation-workspace-viewer-command'
import type { Worktree } from '../../../shared/worktree/types'
import type { AutomationDraft } from '../components/automations/AutomationEditorDialog'
type Field = {
  draft: AutomationDraft
  isHermesTarget: boolean
  worktrees: readonly Worktree[]
  ownerKey?: string
  selectWorkspace: (workspaceId: string) => void
  selectWorkspaceMode: (mode: 'existing' | 'new_per_run') => void
}
type Current = Field & { reviewedTarget: string }
function snapshot(current: Current) {
  return {
    committed: true as const,
    reviewedTarget: current.reviewedTarget,
    projectId: current.draft.projectId,
    mode: current.draft.workspaceMode,
    isHermesTarget: current.isHermesTarget,
    workspaceId: current.draft.workspaceId,
    workspaceIds: current.worktrees.map((worktree) => worktree.id)
  }
}
export type AutomationWorkspaceViewerState = ReturnType<typeof snapshot>
type Control = (action: AutomationWorkspaceViewerAction) => Promise<AutomationWorkspaceViewerState>
const mountedFields = new Set<Control>()
export async function applyAutomationWorkspaceViewerAction(
  action: AutomationWorkspaceViewerAction
): Promise<AutomationWorkspaceViewerState> {
  const parsed = AutomationWorkspaceViewerActionSchema.parse(action)
  if (mountedFields.size !== 1) {
    throw new Error(mountedFields.size ? 'viewer_ambiguous' : 'automation_workspace_unavailable')
  }
  const control = mountedFields.values().next().value
  if (!control) {
    throw new Error('automation_workspace_unavailable')
  }
  return control(parsed)
}
export function useAutomationWorkspaceViewerController(field: Field): void {
  const scope = JSON.stringify([
    field.draft.projectId,
    field.isHermesTarget,
    field.ownerKey,
    field.worktrees
  ])
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef<Current>({ ...field, reviewedTarget: target.current.token })
  const [, setRevision] = useState(0)
  const pending = useRef<{
    action: Exclude<AutomationWorkspaceViewerAction, { kind: 'get' }>
    resolve: (state: AutomationWorkspaceViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useLayoutEffect(() => {
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    const current = { ...field, reviewedTarget: target.current.token }
    latest.current = current
    const request = pending.current
    if (!request) {
      return
    }
    pending.current = null
    const { action } = request
    if (
      current.reviewedTarget !== action.reviewedTarget ||
      (action.kind === 'mode' &&
        (current.draft.workspaceMode !== action.value ||
          (action.value === 'new_per_run' && current.draft.reuseSession))) ||
      (action.kind === 'select' && current.draft.workspaceId !== action.workspaceId)
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve(snapshot(current))
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (action.reviewedTarget !== current.reviewedTarget) {
        throw new Error('viewer_target_changed')
      }
      if (pending.current) {
        throw new Error('viewer_busy')
      }
      if (
        (action.kind === 'mode' && current.isHermesTarget) ||
        (action.kind === 'select' &&
          !current.isHermesTarget &&
          current.draft.workspaceMode !== 'existing')
      ) {
        throw new Error('automation_workspace_control_unavailable')
      }
      if (
        action.kind === 'select' &&
        !current.worktrees.some((worktree) => worktree.id === action.workspaceId)
      ) {
        throw new Error('automation_workspace_unavailable')
      }
      return new Promise((resolve, reject) => {
        pending.current = { action, resolve, reject }
        if (action.kind === 'mode') {
          current.selectWorkspaceMode(action.value)
        } else {
          current.selectWorkspace(action.workspaceId)
        }
        setRevision((revision) => revision + 1)
      })
    }
    mountedFields.add(control)
    return () => {
      mountedFields.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
