import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PluginHostListEntry } from '../../../preload/api-types'
import {
  PluginConsentViewerActionSchema,
  type PluginConsentViewerAction
} from '../../../shared/plugin-settings-viewer-command'

type Form = {
  plugin: PluginHostListEntry | null
  busyDecision: 'approve' | 'keep-disabled' | null
  error: string | null
  decide: (decision: 'approve' | 'keep-disabled') => Promise<boolean>
}
function snapshot(form: Form) {
  if (!form.plugin?.consentFingerprint) {
    throw new Error('plugin_review_unavailable')
  }
  return {
    plugin: form.plugin,
    busyDecision: form.busyDecision,
    error: form.error
  }
}
export type PluginConsentViewerState = ReturnType<typeof snapshot> & {
  accepted?: boolean
  decision?: 'approve' | 'keep-disabled'
}
type Control = (action: PluginConsentViewerAction) => Promise<PluginConsentViewerState>
const mountedReviews = new Set<Control>()
export async function applyPluginConsentViewerAction(
  action: PluginConsentViewerAction
): Promise<PluginConsentViewerState> {
  const parsed = PluginConsentViewerActionSchema.parse(action)
  if (mountedReviews.size !== 1) {
    throw new Error(mountedReviews.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedReviews.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function usePluginConsentViewerController(form: Form): void {
  const latest = useRef(form)
  const busy = useRef(false)
  useLayoutEffect(() => {
    latest.current = form
  })
  const mounted = Boolean(form.plugin)
  useEffect(() => {
    if (!mounted) {
      return
    }
    const control: Control = async (action) => {
      const current = latest.current
      const state = snapshot(current)
      if (action.kind === 'get') {
        return state
      }
      if (busy.current || current.busyDecision) {
        throw new Error('viewer_busy')
      }
      if (action.pluginKey !== state.plugin.pluginKey) {
        throw new Error('plugin_consent_dialog_changed')
      }
      if (action.reviewedFingerprint !== state.plugin.consentFingerprint) {
        throw new Error('plugin_consent_fingerprint_changed')
      }
      busy.current = true
      try {
        if (!(await current.decide(action.decision))) {
          throw new Error('plugin_consent_failed')
        }
        return {
          ...state,
          busyDecision: null,
          error: null,
          accepted: true,
          decision: action.decision
        }
      } finally {
        busy.current = false
      }
    }
    mountedReviews.add(control)
    return () => {
      mountedReviews.delete(control)
    }
  }, [mounted])
}
