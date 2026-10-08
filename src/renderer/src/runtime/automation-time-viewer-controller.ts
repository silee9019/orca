import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  AutomationTimeViewerActionSchema,
  type AutomationTimeViewerAction
} from '../../../shared/automation-time-viewer-command'
import type { AutomationTimeDigitHandle } from '../components/automations/AutomationTimeDigitInput'

type Field = {
  time: string
  mode: 'time' | 'minute'
  period: 'AM' | 'PM'
  hourRef: RefObject<AutomationTimeDigitHandle | null>
  minuteRef: RefObject<AutomationTimeDigitHandle | null>
  onTogglePeriod: () => string
}
type Current = Field & { reviewedTarget: string }
function snapshot(field: Current) {
  return {
    committed: true as const,
    reviewedTarget: field.reviewedTarget,
    time: field.time,
    mode: field.mode,
    period: field.mode === 'time' ? field.period : null,
    hour: field.mode === 'time' ? (field.hourRef.current?.get() ?? null) : null,
    minute: field.minuteRef.current?.get() ?? null
  }
}
export type AutomationTimeViewerState = ReturnType<typeof snapshot>
type Control = (action: AutomationTimeViewerAction) => Promise<AutomationTimeViewerState>
const mountedTimeFields = new Set<Control>()
export async function applyAutomationTimeViewerAction(
  action: AutomationTimeViewerAction
): Promise<AutomationTimeViewerState> {
  const parsed = AutomationTimeViewerActionSchema.parse(action)
  if (mountedTimeFields.size !== 1) {
    throw new Error(mountedTimeFields.size ? 'viewer_ambiguous' : 'automation_time_unavailable')
  }
  const control = mountedTimeFields.values().next().value
  if (!control) {
    throw new Error('automation_time_unavailable')
  }
  return control(parsed)
}
export function useAutomationTimeViewerController(field: Field): void {
  const target = useRef({ mode: field.mode, token: createBrowserUuid() })
  const latest = useRef<Current>({ ...field, reviewedTarget: target.current.token })
  const [, setRevision] = useState(0)
  const digitBusy = useRef(false)
  const pending = useRef<{
    expected: string
    reviewedTarget: string
    resolve: (state: AutomationTimeViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useLayoutEffect(() => {
    if (target.current.mode !== field.mode) {
      target.current = { mode: field.mode, token: createBrowserUuid() }
    }
    const current = { ...field, reviewedTarget: target.current.token }
    latest.current = current
    const request = pending.current
    if (!request) {
      return
    }
    pending.current = null
    if (request.expected !== field.time || request.reviewedTarget !== current.reviewedTarget) {
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
      if (pending.current || digitBusy.current) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'period') {
        if (current.mode !== 'time') {
          throw new Error('automation_time_control_unavailable')
        }
        return new Promise((resolve, reject) => {
          const expected = current.onTogglePeriod()
          pending.current = { expected, reviewedTarget: current.reviewedTarget, resolve, reject }
          setRevision((revision) => revision + 1)
        })
      }
      const input = (action.field === 'hour' ? current.hourRef : current.minuteRef).current
      if (!input || (action.field === 'hour' && current.mode !== 'time')) {
        throw new Error('automation_time_control_unavailable')
      }
      digitBusy.current = true
      try {
        await input.apply(action)
        if (latest.current.reviewedTarget !== action.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        return snapshot(latest.current)
      } finally {
        digitBusy.current = false
      }
    }
    mountedTimeFields.add(control)
    return () => {
      mountedTimeFields.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
