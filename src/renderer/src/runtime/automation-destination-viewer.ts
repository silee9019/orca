import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { automationHostCatalogEntryFingerprint as fingerprint } from '../components/automations/automation-host-catalog-generation'
import { automationCreateHostEligible } from '../components/automations/automation-create-destination'
import type { AutomationCreateDestinationControl as Form } from '../components/automations/use-automation-create-destination'
import type { AutomationDestinationViewerAction as Action } from '../../../shared/automation-destination-viewer-command'
export type AutomationDestinationViewerState = {
  reviewedTarget: string
  selectedStableKey: string | null
  projectIds: string[]
  moveWarning: boolean
  hosts: { stableKey: string; label: string; eligible: boolean }[]
  modalOpen: boolean
  busy: boolean
}
type Control = {
  get: () => AutomationDestinationViewerState
  apply: (action: Action) => Promise<AutomationDestinationViewerState>
}
const mounted = new Set<Control>()
export function automationDestinationSnapshot(): AutomationDestinationViewerState | null {
  return mounted.size === 1 ? (mounted.values().next().value?.get() ?? null) : null
}
export async function applyAutomationDestination(action: Action) {
  if (mounted.size !== 1) {
    throw new Error(mounted.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mounted.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control.apply(action)
}
export function useAutomationDestinationViewer(control: Form): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const latest = useRef({ control, profile, modal })
  const review = useRef({ scope: '', token: createBrowserUuid() })
  const [, setRevision] = useState(0)
  const pending = useRef<{
    stableKey: string
    fingerprint: string
    profile: string | null
    resolve: (state: AutomationDestinationViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  const get = (): AutomationDestinationViewerState => {
    const current = latest.current
    const form = current.control
    const selected = form.resolution.status === 'ready' ? form.resolution.entry : null
    const scope = JSON.stringify([
      current.profile,
      current.modal,
      form.entries.map(fingerprint),
      selected ? fingerprint(selected) : form.resolution,
      form.projects.map((repo) => repo.id),
      form.moveWarning
    ])
    if (review.current.scope !== scope) {
      review.current = { scope, token: createBrowserUuid() }
    }
    return {
      reviewedTarget: review.current.token,
      selectedStableKey: selected?.stableKey ?? null,
      projectIds: form.projects.map((repo) => repo.id),
      moveWarning: Boolean(form.moveWarning),
      hosts: form.entries.map((entry) => ({
        stableKey: entry.stableKey,
        label: entry.label,
        eligible: automationCreateHostEligible(entry)
      })),
      modalOpen: current.modal !== 'none',
      busy: Boolean(pending.current)
    }
  }
  useLayoutEffect(() => {
    latest.current = { control, profile, modal }
    get()
    const request = pending.current
    if (!request) {
      return
    }
    pending.current = null
    const entry = control.entries.find((entry) => entry.stableKey === request.stableKey)
    const selected = control.resolution.status === 'ready' ? control.resolution.entry : null
    if (
      request.profile !== profile ||
      modal !== 'none' ||
      !entry ||
      fingerprint(entry) !== request.fingerprint ||
      !selected ||
      selected.stableKey !== request.stableKey ||
      fingerprint(selected) !== request.fingerprint
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve(get())
    }
  })
  useEffect(() => {
    const viewer: Control = {
      get,
      apply: async (action) => {
        const state = get()
        if (action.kind === 'get') {
          return state
        }
        if (state.busy) {
          throw new Error('viewer_busy')
        }
        if (state.reviewedTarget !== action.reviewedTarget) {
          throw new Error('viewer_target_changed')
        }
        if (state.modalOpen) {
          throw new Error('viewer_modal_open')
        }
        const entry = latest.current.control.entries.find(
          (entry) => entry.stableKey === action.stableKey
        )
        if (!entry || !automationCreateHostEligible(entry)) {
          throw new Error('automation_destination_unavailable')
        }
        return new Promise((resolve, reject) => {
          pending.current = {
            stableKey: entry.stableKey,
            fingerprint: fingerprint(entry),
            profile: latest.current.profile,
            resolve,
            reject
          }
          try {
            latest.current.control.onSelect(entry.stableKey)
          } catch (error) {
            pending.current = null
            reject(
              error instanceof Error ? error : new Error('automation_destination_select_failed')
            )
          }
          setRevision((value) => value + 1)
        })
      }
    }
    mounted.add(viewer)
    return () => {
      mounted.delete(viewer)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
