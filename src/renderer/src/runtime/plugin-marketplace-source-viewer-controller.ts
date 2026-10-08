import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { PluginMarketplaceHostSourceState } from '../../../preload/api-types'
import {
  PluginMarketplaceSourceViewerActionSchema,
  type PluginMarketplaceSourceViewerAction
} from '../../../shared/plugin-marketplace-viewer-command'

type Form = {
  open: boolean
  sources: readonly PluginMarketplaceHostSourceState[]
  url: string
  gitRef: string
  busyAction: string | null
  error: string | null
  urlRef: RefObject<HTMLInputElement | null>
  setUrl: (value: string) => void
  setGitRef: (value: string) => void
  add: () => Promise<boolean>
  refresh: (sourceId: string) => Promise<boolean>
  remove: (sourceId: string) => Promise<boolean>
  close: () => void
}
function snapshot(form: Form) {
  return {
    urlSet: Boolean(form.url),
    gitRef: form.gitRef,
    busyAction: form.busyAction,
    error: form.error,
    sources: form.sources.map((source) => ({
      id: source.id,
      name: source.marketplace?.name ?? null,
      owner: source.marketplace?.owner ?? null,
      ref: source.source.ref,
      commit: source.marketplace?.resolvedCommit ?? null,
      official: source.official,
      stale: source.stale
    }))
  }
}
export type PluginMarketplaceSourceViewerState = ReturnType<typeof snapshot> & { closed?: boolean }
type Control = (
  action: PluginMarketplaceSourceViewerAction
) => Promise<PluginMarketplaceSourceViewerState>
const mountedForms = new Set<Control>()
export async function applyPluginMarketplaceSourceViewerAction(
  action: PluginMarketplaceSourceViewerAction
): Promise<PluginMarketplaceSourceViewerState> {
  const parsed = PluginMarketplaceSourceViewerActionSchema.parse(action)
  if (mountedForms.size !== 1) {
    throw new Error(mountedForms.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedForms.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function usePluginMarketplaceSourceViewerController(form: Form): void {
  const latest = useRef(form)
  const busy = useRef(false)
  const [, setRevision] = useState(0)
  const pending = useRef<{
    ready: boolean
    resolve: (state: PluginMarketplaceSourceViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useLayoutEffect(() => {
    latest.current = form
  })
  useEffect(() => {
    if (!pending.current?.ready) {
      return
    }
    const request = pending.current
    pending.current = null
    request.resolve(snapshot(form))
  })
  useEffect(() => {
    if (!form.open) {
      return
    }
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (busy.current || pending.current || current.busyAction) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'close') {
        current.close()
        return { ...snapshot(current), closed: true }
      }
      if (action.kind === 'focus-url') {
        if (!current.urlRef.current) {
          throw new Error('viewer_unavailable')
        }
        current.urlRef.current.focus()
        return snapshot(current)
      }
      if ('sourceId' in action) {
        const source = current.sources.find((entry) => entry.id === action.sourceId)
        if (!source) {
          throw new Error('plugin_marketplace_source_not_loaded')
        }
        if (action.kind === 'remove' && source.official) {
          throw new Error('plugin_marketplace_source_protected')
        }
      }
      if (action.kind === 'add' && (!current.url.trim() || !current.gitRef.trim())) {
        throw new Error('plugin_marketplace_source_input_required')
      }
      return new Promise((resolve, reject) => {
        const request = { ready: false, resolve, reject }
        pending.current = request
        busy.current = true
        void (async () => {
          switch (action.kind) {
            case 'url':
              current.setUrl(action.value)
              break
            case 'ref':
              current.setGitRef(action.value)
              break
            case 'add':
              if (!(await current.add())) {
                throw new Error('plugin_marketplace_source_failed')
              }
              break
            case 'refresh':
              if (!(await current.refresh(action.sourceId))) {
                throw new Error('plugin_marketplace_source_failed')
              }
              break
            case 'remove':
              if (!(await current.remove(action.sourceId))) {
                throw new Error('plugin_marketplace_source_failed')
              }
              break
          }
        })().then(
          () => {
            busy.current = false
            if (pending.current !== request) {
              return
            }
            request.ready = true
            setRevision((value) => value + 1)
          },
          (error: unknown) => {
            busy.current = false
            if (pending.current !== request) {
              return
            }
            pending.current = null
            reject(error instanceof Error ? error : new Error('plugin_marketplace_source_failed'))
          }
        )
      })
    }
    mountedForms.add(control)
    return () => {
      mountedForms.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [form.open])
}
