import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  AutomationSetupViewerActionSchema,
  type AutomationSetupViewerAction
} from '../../../shared/automation-setup-viewer-command'

type Decision = 'run' | 'skip'
type Field = {
  scope: string
  open: boolean
  defaultDecision: Decision | undefined
  override: Decision | undefined
  onOpenChange: (open: boolean) => void
  selectSetupDecision: (checked: boolean) => void
}
type Current = Field & { reviewedTarget: string }
function snapshot(current: Current) {
  return {
    committed: true as const,
    reviewedTarget: current.reviewedTarget,
    visible: current.defaultDecision !== undefined,
    open: current.open,
    defaultDecision: current.defaultDecision ?? null,
    override: current.override ?? null,
    decision: current.override ?? current.defaultDecision ?? null
  }
}
export type AutomationSetupViewerState = ReturnType<typeof snapshot>
type Control = (action: AutomationSetupViewerAction) => Promise<AutomationSetupViewerState>
const mountedFields = new Set<Control>()
export async function applyAutomationSetupViewerAction(
  action: AutomationSetupViewerAction
): Promise<AutomationSetupViewerState> {
  const parsed = AutomationSetupViewerActionSchema.parse(action)
  if (mountedFields.size !== 1) {
    throw new Error(mountedFields.size ? 'viewer_ambiguous' : 'automation_setup_unavailable')
  }
  const control = mountedFields.values().next().value
  if (!control) {
    throw new Error('automation_setup_unavailable')
  }
  return control(parsed)
}
export function useAutomationSetupViewerController(field: Field): void {
  const target = useRef({ scope: field.scope, token: createBrowserUuid() })
  const latest = useRef<Current>({ ...field, reviewedTarget: target.current.token })
  const [, setRevision] = useState(0)
  const pending = useRef<{
    action: Exclude<AutomationSetupViewerAction, { kind: 'get' }>
    resolve: (state: AutomationSetupViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useLayoutEffect(() => {
    if (target.current.scope !== field.scope) {
      target.current = { scope: field.scope, token: createBrowserUuid() }
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
      action.reviewedTarget !== current.reviewedTarget ||
      current.defaultDecision === undefined ||
      (action.kind === 'open' && action.value !== current.open) ||
      (action.kind === 'decision' && action.value !== current.override)
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
      if (current.defaultDecision === undefined) {
        throw new Error('automation_setup_unavailable')
      }
      if (action.kind === 'decision' && !current.open) {
        throw new Error('automation_setup_control_unavailable')
      }
      return new Promise((resolve, reject) => {
        pending.current = { action, resolve, reject }
        if (action.kind === 'open') {
          current.onOpenChange(action.value)
        } else {
          current.selectSetupDecision(action.value === 'run')
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
