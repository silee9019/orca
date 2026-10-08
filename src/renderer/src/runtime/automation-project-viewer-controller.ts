import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { hasMultipleHostsInGroup } from '../components/automations/automation-project-groups'
import {
  AutomationProjectViewerActionSchema,
  type AutomationProjectViewerAction
} from '../../../shared/automation-project-viewer-command'
import {
  automationProjectFormSnapshot,
  automationProjectReviewScope,
  type AutomationProjectViewerForm,
  type AutomationProjectViewerState,
  type AutomationProjectOutcome
} from './automation-project-viewer-state'

type Control = {
  get: () => AutomationProjectViewerState
  apply: (action: AutomationProjectViewerAction) => Promise<AutomationProjectViewerState>
}
type ProjectRequest = {
  action: Exclude<AutomationProjectViewerAction, { kind: 'get' }>
  routeKey: string
  routeChanged: boolean
  ready: boolean
  result?: AutomationProjectOutcome
  resolve: (state: AutomationProjectViewerState) => void
  reject: (error: Error) => void
}
const mounted = new Set<Control>()
export function automationProjectViewerSnapshot() {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export async function applyAutomationProjectViewerAction(action: AutomationProjectViewerAction) {
  const parsed = AutomationProjectViewerActionSchema.parse(action)
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(parsed)
}
function validate(
  form: AutomationProjectViewerForm,
  action: Exclude<AutomationProjectViewerAction, { kind: 'get' }>
): void {
  if (action.kind === 'open') {
    return
  }
  if (!form.open) {
    throw new Error('automation_project_picker_closed')
  }
  if (
    action.kind === 'select' &&
    !form.filteredGroups.some((group) => group.sources.some((repo) => repo.id === action.repoId))
  ) {
    throw new Error('automation_project_not_visible')
  }
  if (
    action.kind === 'command' &&
    action.repoId !== '' &&
    !form.filteredGroups.some((group) => group.repo.id === action.repoId)
  ) {
    throw new Error('automation_project_not_visible')
  }
  if (
    (action.kind === 'host-menu' || action.kind === 'host-hover') &&
    action.projectKey !== null &&
    !form.filteredGroups.some(
      (group) => group.projectKey === action.projectKey && hasMultipleHostsInGroup(group.sources)
    )
  ) {
    throw new Error('automation_project_host_menu_unavailable')
  }
  if (action.kind === 'add' && !form.allowAddProject) {
    throw new Error('automation_project_add_unavailable')
  }
}
export function useAutomationProjectViewerController(form: AutomationProjectViewerForm): void {
  const scope = automationProjectReviewScope(form)
  const target = useRef({ scope, token: createBrowserUuid() })
  const latest = useRef(form)
  const outcome = useRef<AutomationProjectOutcome | null>(null)
  const pending = useRef<ProjectRequest | null>(null)
  const [, setRevision] = useState(0)
  const get = () =>
    automationProjectFormSnapshot(
      latest.current,
      Boolean(pending.current),
      target.current.token,
      outcome.current
    )
  useLayoutEffect(() => {
    latest.current = form
    if (pending.current && pending.current.routeKey !== form.routeKey) {
      pending.current.routeChanged = true
    }
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
  })
  useEffect(() => {
    const request = pending.current
    if (!request?.ready) {
      return
    }
    const action = request.action
    const routeChanged = request.routeChanged || request.routeKey !== form.routeKey
    pending.current = null
    if (action.kind === 'add' && request.result?.action === 'add') {
      request.result.reviewStatus = routeChanged ? 'changed' : 'current'
      outcome.current = request.result
      if (request.result.result.selected && form.value !== request.result.result.repoId) {
        request.result.reviewStatus = 'changed'
      }
      request.resolve(get())
      return
    }
    if (
      routeChanged ||
      (action.kind === 'open' && form.open !== action.value) ||
      (action.kind === 'query' && form.query !== action.value) ||
      (action.kind === 'command' && form.commandValue !== action.repoId) ||
      (action.kind === 'host-menu' && form.hostMenuProjectKey !== action.projectKey) ||
      (action.kind === 'select' && (form.value !== action.repoId || form.open))
    ) {
      request.reject(new Error('viewer_target_changed'))
      return
    }
    outcome.current = request.result ?? null
    if (action.kind === 'focus' && !form.isInputFocused()) {
      request.reject(new Error('automation_project_focus_unavailable'))
    } else {
      request.resolve(get())
    }
  })
  useEffect(() => {
    const control: Control = {
      get,
      apply: async (action) => {
        if (action.kind === 'get') {
          return get()
        }
        const current = latest.current
        if (pending.current || current.isAdding) {
          throw new Error('viewer_busy')
        }
        if (action.reviewedTarget !== target.current.token) {
          throw new Error('viewer_target_changed')
        }
        validate(current, action)
        return new Promise((resolve, reject) => {
          const request: ProjectRequest = {
            action,
            routeKey: current.routeKey,
            routeChanged: false,
            ready: true,
            resolve,
            reject
          }
          pending.current = request
          outcome.current = null
          let operation: Promise<AutomationProjectOutcome> | null = null
          try {
            switch (action.kind) {
              case 'open':
                current.handleOpenChange(action.value)
                break
              case 'query':
                current.setQuery(action.value)
                break
              case 'command':
                current.setCommandValue(action.repoId)
                break
              case 'select':
                current.handleSelect(action.repoId)
                break
              case 'host-menu':
                current.setHostMenuProjectKey(action.projectKey)
                break
              case 'host-hover':
                operation = current
                  .setHostMenuHover(action.projectKey, action.region, action.hovered)
                  .then(() => ({ action: 'host-hover', operation: 'settled' }))
                break
              case 'focus':
                operation = current
                  .focusSearchInput()
                  .then((focused) => ({ action: 'focus', focused }))
                break
              case 'add':
                operation = current
                  .handleAddFolder(action.path)
                  .then((result) => ({ action: 'add', result, reviewStatus: 'current' }))
                break
            }
            if (operation) {
              request.ready = false
              void operation.then(
                (result) => {
                  if (pending.current === request) {
                    request.result = result
                    request.ready = true
                    setRevision((value) => value + 1)
                  }
                },
                () => {
                  if (pending.current === request) {
                    pending.current = null
                    reject(new Error('automation_project_action_failed'))
                  }
                }
              )
            }
            setRevision((value) => value + 1)
          } catch (error) {
            pending.current = null
            reject(error instanceof Error ? error : new Error('automation_project_action_failed'))
          }
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
