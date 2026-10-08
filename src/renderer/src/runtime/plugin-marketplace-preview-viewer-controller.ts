import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PluginMarketplaceHostInstallPreview } from '../../../preload/api-types'
import {
  PluginMarketplacePreviewViewerActionSchema,
  type PluginMarketplacePreviewViewerAction
} from '../../../shared/plugin-marketplace-viewer-command'

type Form = {
  preview: PluginMarketplaceHostInstallPreview | null
  mode: 'install' | 'update'
  busy: boolean
  currentVersion: boolean
  error: string | null
  close: () => void
  confirm: () => Promise<boolean>
}
function snapshot(form: Form) {
  const preview = form.preview
  if (!preview) {
    throw new Error('viewer_unavailable')
  }
  return {
    mode: form.mode,
    busy: form.busy,
    currentVersion: form.currentVersion,
    blocked: Boolean(preview.blockedByKillList),
    error: form.error,
    marketplaceSourceId: preview.marketplaceSourceId,
    marketplaceCommit: preview.marketplaceCommit,
    pluginKey: preview.pluginKey,
    resolvedCommit: preview.resolvedCommit,
    contentHash: preview.contentHash,
    name: preview.manifest.name,
    version: preview.manifest.version,
    capabilities: preview.manifest.capabilities.map((capability) => capability.kind),
    hasWorker: Boolean(preview.manifest.main)
  }
}
export type PluginMarketplacePreviewViewerState = ReturnType<typeof snapshot> & {
  closed?: boolean
  accepted?: boolean
}
type Control = (
  action: PluginMarketplacePreviewViewerAction
) => Promise<PluginMarketplacePreviewViewerState>
const mountedPreviews = new Set<Control>()
export async function applyPluginMarketplacePreviewViewerAction(
  action: PluginMarketplacePreviewViewerAction
): Promise<PluginMarketplacePreviewViewerState> {
  const parsed = PluginMarketplacePreviewViewerActionSchema.parse(action)
  if (mountedPreviews.size !== 1) {
    throw new Error(mountedPreviews.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedPreviews.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function usePluginMarketplacePreviewViewerController(form: Form): void {
  const open = Boolean(form.preview)
  const latest = useRef(form)
  const busy = useRef(false)
  useLayoutEffect(() => {
    latest.current = form
  })
  useEffect(() => {
    if (!open) {
      return
    }
    const control: Control = async (action) => {
      const current = latest.current
      const state = snapshot(current)
      if (action.kind === 'get') {
        return state
      }
      if (busy.current || current.busy) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'close') {
        current.close()
        return { ...state, closed: true }
      }
      if (state.blocked || state.currentVersion) {
        throw new Error('plugin_marketplace_install_unavailable')
      }
      if (
        action.marketplaceSourceId !== state.marketplaceSourceId ||
        action.marketplaceCommit !== state.marketplaceCommit ||
        action.pluginKey !== state.pluginKey ||
        action.resolvedCommit !== state.resolvedCommit ||
        action.contentHash !== state.contentHash
      ) {
        throw new Error('plugin_marketplace_preview_changed')
      }
      busy.current = true
      try {
        if (!(await current.confirm())) {
          throw new Error('plugin_marketplace_install_failed')
        }
        return { ...state, busy: false, error: null, closed: true, accepted: true }
      } finally {
        busy.current = false
      }
    }
    mountedPreviews.add(control)
    return () => {
      mountedPreviews.delete(control)
    }
  }, [open])
}
