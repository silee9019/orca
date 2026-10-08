import { useEffect, useLayoutEffect, useRef } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  SkillInstallAgentViewerActionSchema,
  type SkillInstallAgentViewerAction
} from '../../../shared/skill-install-agent-viewer-command'
import type { SkillInstallProviderId } from '../../../shared/skill-install-providers'

import type { SkillInstallViewerTarget } from './skill-install-viewer-target'

export function skillInstallAgentViewerTarget(
  form: SkillInstallViewerTarget,
  identity: string
): string {
  return JSON.stringify([
    identity,
    form.environmentId,
    form.ownerRevisions.get(form.environmentId),
    form.scope,
    form.workspace,
    form.executionTarget
  ])
}

type Form = {
  target: string | undefined
  open: boolean
  busy: boolean
  selected: ReadonlySet<SkillInstallProviderId>
  selectable: readonly SkillInstallProviderId[]
  setOpen: (value: boolean) => void
  setProvider: (provider: SkillInstallProviderId, checked: boolean) => void
  selectAll: () => void
  clearSelectable: () => void
}
function snapshot(form: Form, reviewedTarget: string, pending: boolean) {
  return {
    reviewedTarget,
    open: form.open,
    busy: form.busy || pending,
    selectableProviders: [...form.selectable],
    selectedProviders: [...form.selected]
  }
}
export type SkillInstallAgentViewerState = ReturnType<typeof snapshot>
type Control = {
  target: () => string | undefined
  get: () => SkillInstallAgentViewerState
  apply: (action: SkillInstallAgentViewerAction) => Promise<SkillInstallAgentViewerState>
}
const mountedPickers = new Set<Control>()
export function skillInstallAgentViewerSnapshot(target: string) {
  if (mountedPickers.size !== 1) {
    return null
  }
  const control = mountedPickers.values().next().value
  return control?.target() === target ? control.get() : null
}
export async function applySkillInstallAgentViewerAction(
  target: string,
  action: SkillInstallAgentViewerAction
) {
  const parsed = SkillInstallAgentViewerActionSchema.parse(action)
  if (mountedPickers.size !== 1) {
    throw new Error(mountedPickers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedPickers.values().next().value
  if (!control || control.target() !== target) {
    throw new Error('viewer_target_changed')
  }
  return control.apply(parsed)
}
function isCommitted(form: Form, action: Exclude<SkillInstallAgentViewerAction, { kind: 'get' }>) {
  return action.kind === 'open'
    ? form.open === action.value
    : action.kind === 'provider'
      ? form.selected.has(action.provider) === action.checked
      : form.selectable.every((provider) => form.selected.has(provider) === action.checked)
}
export function useSkillInstallAgentViewerController(form: Form): void {
  const scope = JSON.stringify([form.target, form.selectable])
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef({ form, token: target.current.token })
  type Request = {
    action: Exclude<SkillInstallAgentViewerAction, { kind: 'get' }>
    resolve: (value: SkillInstallAgentViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  useLayoutEffect(() => {
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    const token = target.current.token
    latest.current = { form, token }
    const request = pending.current
    if (!request) {
      return
    }
    if (
      request.action.reviewedTarget !== token ||
      form.busy ||
      (request.action.kind !== 'open' && !form.open)
    ) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (isCommitted(form, request.action)) {
      pending.current = null
      request.resolve(snapshot(form, token, false))
    }
  })
  const enabled = Boolean(form.target)
  useEffect(() => {
    if (!enabled) {
      return
    }
    const control: Control = {
      target: () => latest.current.form.target,
      get: () => snapshot(latest.current.form, latest.current.token, pending.current !== null),
      apply: async (action) => {
        const current = latest.current
        if (action.kind === 'get') {
          return control.get()
        }
        if (current.form.busy || pending.current) {
          throw new Error('viewer_busy')
        }
        if (action.reviewedTarget !== current.token) {
          throw new Error('viewer_target_changed')
        }
        if (action.kind !== 'open' && !current.form.open) {
          throw new Error('skill_agent_picker_closed')
        }
        if (action.kind === 'provider' && !current.form.selectable.includes(action.provider)) {
          throw new Error('skill_provider_unavailable')
        }
        if (isCommitted(current.form, action)) {
          return control.get()
        }
        return new Promise((resolve, reject) => {
          pending.current = { action, resolve, reject }
          try {
            if (action.kind === 'open') {
              current.form.setOpen(action.value)
            } else if (action.kind === 'provider') {
              current.form.setProvider(action.provider, action.checked)
            } else if (action.checked) {
              current.form.selectAll()
            } else {
              current.form.clearSelectable()
            }
          } catch (error: unknown) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('skill_provider_selection_failed'))
          }
        })
      }
    }
    mountedPickers.add(control)
    return () => {
      mountedPickers.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [enabled])
}
