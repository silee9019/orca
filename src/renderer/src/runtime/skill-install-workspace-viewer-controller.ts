import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  SkillInstallWorkspaceViewerActionSchema,
  type SkillInstallWorkspaceViewerAction
} from '../../../shared/skill-install-workspace-viewer-command'
import type { SkillInstallWorkspaceChoice } from '../components/skills/skill-install-workspace-choices'
import type { SkillInstallViewerTarget } from './skill-install-viewer-target'

export function skillInstallWorkspaceViewerTarget(
  form: SkillInstallViewerTarget,
  identity: string
): string {
  return JSON.stringify([
    identity,
    form.environmentId,
    form.ownerRevisions.get(form.environmentId),
    form.scope,
    form.executionTarget
  ])
}
type Form = {
  target: string | undefined
  open: boolean
  disabled: boolean
  value: string
  query: string
  commandValue: string
  choices: readonly SkillInstallWorkspaceChoice[]
  filteredChoices: readonly SkillInstallWorkspaceChoice[]
  input: () => HTMLInputElement | null
  handleOpenChange: (value: boolean) => void
  setQuery: (value: string) => void
  setCommandValue: (value: string) => void
  handleSelect: (id: string) => void
  handleTriggerKeyDown: (
    event: Pick<
      React.KeyboardEvent<HTMLButtonElement>,
      'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'preventDefault'
    >
  ) => void
  focusSearchInput: () => void
  cancelFocus: () => void
}
function snapshot(form: Form, reviewedTarget: string, pending: boolean) {
  return {
    reviewedTarget,
    open: form.open,
    busy: form.disabled || pending,
    value: form.value,
    query: form.query,
    highlightedId: form.commandValue,
    visibleWorkspaceIds: form.filteredChoices.map((choice) => choice.id),
    searchFocused: Boolean(form.input() && document.activeElement === form.input())
  }
}
export type SkillInstallWorkspaceViewerState = ReturnType<typeof snapshot>
type Control = {
  target: () => string | undefined
  get: () => SkillInstallWorkspaceViewerState
  apply: (action: SkillInstallWorkspaceViewerAction) => Promise<SkillInstallWorkspaceViewerState>
}
const mountedPickers = new Set<Control>()
export function skillInstallWorkspaceViewerSnapshot(target: string) {
  if (mountedPickers.size !== 1) {
    return null
  }
  const control = mountedPickers.values().next().value
  return control?.target() === target ? control.get() : null
}
export async function applySkillInstallWorkspaceViewerAction(
  target: string,
  action: SkillInstallWorkspaceViewerAction
) {
  const parsed = SkillInstallWorkspaceViewerActionSchema.parse(action)
  if (mountedPickers.size !== 1) {
    throw new Error(mountedPickers.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedPickers.values().next().value
  if (!control || control.target() !== target) {
    throw new Error('viewer_target_changed')
  }
  return control.apply(parsed)
}
function isCommitted(
  form: Form,
  action: Exclude<SkillInstallWorkspaceViewerAction, { kind: 'get' }>
): boolean {
  switch (action.kind) {
    case 'open':
      return form.open === action.value && (action.value || form.query === '')
    case 'query':
      return form.open && form.query === action.value
    case 'highlight':
      return form.open && form.commandValue === action.id
    case 'choose':
      return form.value === action.id && !form.open && form.query === ''
    case 'trigger-key':
      return form.open && (action.key.startsWith('Arrow') || form.query === action.key)
    case 'focus':
      return Boolean(form.open && form.input() && document.activeElement === form.input())
  }
}
export function useSkillInstallWorkspaceViewerController(form: Form): void {
  const scope = JSON.stringify([form.target, form.choices])
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef({ form, token: target.current.token })
  const [, setRevision] = useState(0)
  const focusFrame = useRef<number | null>(null)
  type Request = {
    action: Exclude<SkillInstallWorkspaceViewerAction, { kind: 'get' }>
    resolve: (value: SkillInstallWorkspaceViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  useLayoutEffect(() => {
    if (target.current.scope !== scope) {
      form.cancelFocus()
      if (focusFrame.current !== null) {
        cancelAnimationFrame(focusFrame.current)
        focusFrame.current = null
      }
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
      form.disabled ||
      (!form.open && !['choose', 'open'].includes(request.action.kind))
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
        if (current.form.disabled || pending.current) {
          throw new Error('viewer_busy')
        }
        if (action.reviewedTarget !== current.token) {
          throw new Error('viewer_target_changed')
        }
        if (!current.form.choices.length) {
          throw new Error('skill_workspace_unavailable')
        }
        if (!['open', 'trigger-key'].includes(action.kind) && !current.form.open) {
          throw new Error('skill_workspace_picker_closed')
        }
        if (action.kind === 'trigger-key' && current.form.open) {
          throw new Error('skill_workspace_trigger_unavailable')
        }
        if (
          (action.kind === 'choose' || action.kind === 'highlight') &&
          !current.form.filteredChoices.some((choice) => choice.id === action.id)
        ) {
          throw new Error('skill_workspace_not_visible')
        }
        if (action.kind === 'focus' && !current.form.input()) {
          throw new Error('skill_workspace_search_unavailable')
        }
        if (isCommitted(current.form, action)) {
          return control.get()
        }
        return new Promise((resolve, reject) => {
          const request: Request = { action, resolve, reject }
          pending.current = request
          try {
            if (action.kind === 'open') {
              current.form.handleOpenChange(action.value)
            } else if (action.kind === 'query') {
              current.form.setQuery(action.value)
            } else if (action.kind === 'highlight') {
              current.form.setCommandValue(action.id)
            } else if (action.kind === 'choose') {
              current.form.handleSelect(action.id)
            } else if (action.kind === 'trigger-key') {
              current.form.handleTriggerKeyDown({
                key: action.key,
                metaKey: false,
                ctrlKey: false,
                altKey: false,
                preventDefault: () => undefined
              })
            } else {
              current.form.focusSearchInput()
              focusFrame.current = requestAnimationFrame(() => {
                focusFrame.current = null
                if (pending.current === request) {
                  setRevision((revision) => revision + 1)
                }
              })
            }
          } catch (error: unknown) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('skill_workspace_selection_failed'))
          }
        })
      }
    }
    mountedPickers.add(control)
    return () => {
      mountedPickers.delete(control)
      if (focusFrame.current !== null) {
        cancelAnimationFrame(focusFrame.current)
      }
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [enabled])
}
