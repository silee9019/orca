import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { defaultFilter, useCommandState } from 'cmdk'
import type { SparsePreset } from '../../../shared/worktree/create-types'
import type { SparsePresetViewerAction } from '../../../shared/sparse-preset-viewer-command'
type Scope = { repoId: string; ownerKey: string }
type Action = Extract<SparsePresetViewerAction, { kind: 'chooser-query' | 'chooser-command' }>
type Form = {
  scope?: Scope
  presets: SparsePreset[]
  fullLabel: string
  query: string
  commandValue: string
  setQuery: (value: string) => void
  setCommandValue: (value: string) => void
}
type State = {
  query: string
  commandValue: string
  visibleValues: string[]
  searchSettled: boolean
  commandSettled: boolean
}
type Control = { scope: Scope; get: () => State; apply: (action: Action) => Promise<void> }
const mounted = new Set<Control>()
const mountListeners = new Set<() => void>()
export function subscribeSparsePresetChooserMount(listener: () => void): () => void {
  mountListeners.add(listener)
  return () => {
    mountListeners.delete(listener)
  }
}
function notifyMount(): void {
  for (const listener of mountListeners) {
    listener()
  }
}
function controls(repoId: string, ownerKey: string) {
  return [...mounted].filter(
    (entry) => entry.scope.repoId === repoId && entry.scope.ownerKey === ownerKey
  )
}
export function sparsePresetChooserSnapshot(repoId: string, ownerKey: string): State | null {
  const candidates = controls(repoId, ownerKey)
  return candidates.length === 1 ? candidates[0].get() : null
}
export async function applySparsePresetChooserControl(
  repoId: string,
  ownerKey: string,
  action: Action
): Promise<void> {
  const candidates = controls(repoId, ownerKey)
  if (candidates.length !== 1) {
    throw new Error(candidates.length ? 'viewer_ambiguous' : 'sparse_preset_chooser_closed')
  }
  return candidates[0].apply(action)
}
export function SparsePresetChooserViewer(form: Form): null {
  const commandSearch = useCommandState((state) => state.search)
  const commandSelected = useCommandState((state) => state.value)
  const scopeRepo = form.scope?.repoId
  const scopeOwner = form.scope?.ownerKey
  const latest = useRef({ ...form, commandSearch, commandSelected })
  const pending = useRef<{
    action: Action
    resolve: () => void
    reject: (error: Error) => void
  } | null>(null)
  const [, setRevision] = useState(0)
  const get = (): State => {
    const current = latest.current
    const options = [
      { value: 'full', keywords: [current.fullLabel] },
      ...current.presets.map((preset) => ({
        value: `preset:${preset.id}`,
        keywords: [preset.name, ...preset.directories]
      }))
    ]
    return {
      query: current.query,
      commandValue: current.commandValue,
      searchSettled: current.commandSearch === current.query,
      commandSettled: current.commandSelected === current.commandValue,
      visibleValues: options
        .filter((option) => defaultFilter(option.value, current.query, option.keywords) > 0)
        .map((option) => option.value)
    }
  }
  useLayoutEffect(() => {
    latest.current = { ...form, commandSearch, commandSelected }
  })
  useEffect(() => {
    const request = pending.current
    if (!request || !get().searchSettled || !get().commandSettled) {
      return
    }
    pending.current = null
    const current = get()
    if (
      (request.action.kind === 'chooser-query' && current.query !== request.action.value) ||
      (request.action.kind === 'chooser-command' && current.commandValue !== request.action.value)
    ) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve()
    }
  })
  useEffect(() => {
    if (!scopeRepo || scopeOwner === undefined) {
      return
    }
    const control: Control = {
      scope: { repoId: scopeRepo, ownerKey: scopeOwner },
      get,
      apply: async (action) => {
        if (pending.current) {
          throw new Error('viewer_busy')
        }
        if (
          action.kind === 'chooser-command' &&
          action.value !== '' &&
          !get().visibleValues.includes(action.value)
        ) {
          throw new Error('sparse_preset_not_visible')
        }
        return new Promise<void>((resolve, reject) => {
          pending.current = { action, resolve, reject }
          if (action.kind === 'chooser-query') {
            latest.current.setQuery(action.value)
          } else {
            latest.current.setCommandValue(action.value)
          }
          setRevision((value) => value + 1)
        })
      }
    }
    mounted.add(control)
    notifyMount()
    return () => {
      mounted.delete(control)
      notifyMount()
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [scopeRepo, scopeOwner])
  return null
}
