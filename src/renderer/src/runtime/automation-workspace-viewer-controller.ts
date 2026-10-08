import { useAppStore } from '@/store'
import {
  applyAutomationWorkspacePicker,
  automationWorkspacePickerSnapshot
} from './automation-workspace-picker-viewer'
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
  branchOwnerKey?: string
  selectBaseBranch?: (value: string) => void
  validateBaseBranch?: (value: string) => Promise<boolean>
  selectWorkspace: (workspaceId: string) => void
  selectWorkspaceMode: (mode: 'existing' | 'new_per_run') => void
}
type Current = Field & { reviewedTarget: string; modal: string }
function snapshot(current: Current) {
  return {
    committed: true as const,
    picker: automationWorkspacePickerSnapshot(),
    reviewedTarget: current.reviewedTarget,
    projectId: current.draft.projectId,
    mode: current.draft.workspaceMode,
    isHermesTarget: current.isHermesTarget,
    workspaceId: current.draft.workspaceId,
    baseBranch: current.draft.baseBranch,
    canSelectBaseBranch:
      !current.isHermesTarget &&
      current.draft.workspaceMode === 'new_per_run' &&
      Boolean(current.selectBaseBranch && current.validateBaseBranch),
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
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const pickerBusy = useRef(false)
  const validation = useRef<{
    reviewedTarget: string
    branch: string
    reject: (error: Error) => void
  } | null>(null)
  const scope = JSON.stringify([
    profile,
    modal,
    field.draft.projectId,
    field.isHermesTarget,
    field.ownerKey,
    field.branchOwnerKey,
    field.worktrees
  ])
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef<Current>({ ...field, modal, reviewedTarget: target.current.token })
  const [, setRevision] = useState(0)
  const pending = useRef<{
    action: Exclude<AutomationWorkspaceViewerAction, { kind: 'get' | 'picker-form' }>
    resolve: (state: AutomationWorkspaceViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useLayoutEffect(() => {
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    const current = { ...field, modal, reviewedTarget: target.current.token }
    latest.current = current
    const checking = validation.current
    if (
      checking &&
      (current.reviewedTarget !== checking.reviewedTarget ||
        current.draft.workspaceMode !== 'new_per_run' ||
        current.draft.baseBranch !== checking.branch)
    ) {
      checking.reject(new Error('viewer_target_changed'))
      validation.current = null
    }
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
      (action.kind === 'select' && current.draft.workspaceId !== action.workspaceId) ||
      (action.kind === 'base-branch' && current.draft.baseBranch !== action.value)
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
      if (pending.current || pickerBusy.current) {
        throw new Error('viewer_busy')
      }
      if (current.modal !== 'none') {
        throw new Error('viewer_modal_open')
      }
      if (action.kind === 'picker-form') {
        pickerBusy.current = true
        try {
          const picker = await applyAutomationWorkspacePicker(action.action)
          if (latest.current.reviewedTarget !== action.reviewedTarget) {
            throw new Error('viewer_target_changed')
          }
          return { ...snapshot(latest.current), picker }
        } finally {
          pickerBusy.current = false
        }
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
      if (action.kind === 'base-branch') {
        if (!snapshot(current).canSelectBaseBranch || !current.validateBaseBranch) {
          throw new Error('automation_base_branch_unavailable')
        }
        pickerBusy.current = true
        try {
          const allowed = await new Promise<boolean>((resolve, reject) => {
            validation.current = {
              reviewedTarget: current.reviewedTarget,
              branch: current.draft.baseBranch,
              reject
            }
            void Promise.resolve()
              .then(() => current.validateBaseBranch?.(action.value))
              .then((value) => resolve(value === true), reject)
          })
          if (
            !mountedFields.has(control) ||
            latest.current.reviewedTarget !== action.reviewedTarget ||
            latest.current.draft.workspaceMode !== 'new_per_run'
          ) {
            throw new Error('viewer_target_changed')
          }
          if (!allowed) {
            throw new Error('automation_base_branch_unavailable')
          }
        } finally {
          validation.current = null
          pickerBusy.current = false
        }
      }
      return new Promise((resolve, reject) => {
        pending.current = { action, resolve, reject }
        try {
          if (action.kind === 'mode') {
            current.selectWorkspaceMode(action.value)
          } else if (action.kind === 'base-branch') {
            current.selectBaseBranch?.(action.value)
          } else {
            current.selectWorkspace(action.workspaceId)
          }
        } catch (error) {
          pending.current = null
          reject(error instanceof Error ? error : new Error('automation_workspace_change_failed'))
          return
        }
        setRevision((revision) => revision + 1)
      })
    }
    mountedFields.add(control)
    return () => {
      mountedFields.delete(control)
      validation.current?.reject(new Error('viewer_unmounted'))
      validation.current = null
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
