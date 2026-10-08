import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createBrowserUuid } from '@/lib/browser-uuid'
import {
  ExtensionsSidebarActionSchema,
  type ExtensionsSidebarAction,
  type ExtensionsSidebarPage
} from '../../../shared/extensions-sidebar-command'
import type { GlobalSettings } from '../../../shared/global-settings-types'

type Form = {
  ownerKey: string | null
  activeView: string
  modalOpen: boolean
  visible: Record<ExtensionsSidebarPage, boolean>
  open: Record<ExtensionsSidebarPage, () => void>
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<void>
}
type State = {
  reviewedTarget: string
  activeView: string
  visible: Form['visible']
  modalOpen: boolean
  busy: boolean
  completed?: {
    kind: Exclude<ExtensionsSidebarAction, { kind: 'get' }>['kind']
    page: ExtensionsSidebarPage
    reviewStatus: 'current' | 'changed'
  }
}
type Pending = {
  action: Exclude<ExtensionsSidebarAction, { kind: 'get' }>
  ownerKey: Form['ownerKey']
  ownerChanged: boolean
  ready: boolean
  resolve: (state: State) => void
  reject: (error: Error) => void
}
type Control = (action: ExtensionsSidebarAction) => Promise<State>
const mounted = new Set<Control>()
export async function applyExtensionsSidebarAction(
  action: ExtensionsSidebarAction
): Promise<State> {
  const parsed = ExtensionsSidebarActionSchema.parse(action)
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
const settingFor = {
  automations: 'showAutomationsButton',
  skills: 'showSkillsButton',
  artifacts: 'showArtifactsButton'
} as const

export function useExtensionsSidebarController(form: Form) {
  const { updateSettings } = form
  const setVisible = useCallback(
    (page: ExtensionsSidebarPage, visible: boolean) =>
      updateSettings({ [settingFor[page]]: visible }),
    [updateSettings]
  )
  const hide = useCallback((page: ExtensionsSidebarPage) => setVisible(page, false), [setVisible])
  const latest = useRef({ ...form, hide, setVisible })
  const pending = useRef<Pending | null>(null)
  const target = useRef({ scope: '', token: createBrowserUuid() })
  const [, setRevision] = useState(0)
  const get = (): State => {
    const current = latest.current
    const scope = JSON.stringify([
      current.ownerKey,
      current.activeView,
      current.modalOpen,
      current.visible
    ])
    if (target.current.scope !== scope) {
      target.current = { scope, token: createBrowserUuid() }
    }
    return {
      reviewedTarget: target.current.token,
      activeView: current.activeView,
      visible: current.visible,
      modalOpen: current.modalOpen,
      busy: Boolean(pending.current)
    }
  }
  useLayoutEffect(() => {
    latest.current = { ...form, hide, setVisible }
    if (pending.current && pending.current.ownerKey !== form.ownerKey) {
      pending.current.ownerChanged = true
    }
    get()
  })
  useEffect(() => {
    const request = pending.current
    if (!request?.ready) {
      return
    }
    pending.current = null
    request.resolve({
      ...get(),
      completed: {
        kind: request.action.kind,
        page: request.action.page,
        reviewStatus: request.ownerChanged ? 'changed' : 'current'
      }
    })
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const state = get()
      if (action.kind === 'get') {
        return state
      }
      if (pending.current) {
        throw new Error('viewer_busy')
      }
      if (action.reviewedTarget !== state.reviewedTarget) {
        throw new Error('viewer_target_changed')
      }
      if (state.modalOpen) {
        throw new Error('viewer_modal_open')
      }
      const visible = state.visible[action.page]
      if (action.kind === 'show' && visible) {
        throw new Error('sidebar_entry_visible')
      }
      if ((action.kind === 'open' || action.kind === 'hide') && !visible) {
        throw new Error('sidebar_entry_hidden')
      }
      return new Promise((resolve, reject) => {
        const request: Pending = {
          action,
          ownerKey: latest.current.ownerKey,
          ownerChanged: false,
          ready: false,
          resolve,
          reject
        }
        pending.current = request
        const perform = async () => {
          if (action.kind === 'open' || action.kind === 'open-page') {
            latest.current.open[action.page]()
          } else {
            await latest.current.setVisible(action.page, action.kind === 'show')
          }
        }
        void perform().then(
          () => {
            if (pending.current !== request) {
              return
            }
            request.ready = true
            setRevision((value) => value + 1)
          },
          (error: unknown) => {
            if (pending.current !== request) {
              return
            }
            pending.current = null
            reject(error instanceof Error ? error : new Error('sidebar_action_failed'))
            setRevision((value) => value + 1)
          }
        )
        setRevision((value) => value + 1)
      })
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
  const hideAutomationsButton = useCallback(() => {
    void hide('automations')
  }, [hide])
  const hideSkillsButton = useCallback(() => {
    void hide('skills')
  }, [hide])
  const hideArtifactsButton = useCallback(() => {
    void hide('artifacts')
  }, [hide])
  return { hideAutomationsButton, hideSkillsButton, hideArtifactsButton }
}
