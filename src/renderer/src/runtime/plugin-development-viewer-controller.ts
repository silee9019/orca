import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  PluginDevelopmentViewerActionSchema,
  type PluginDevelopmentViewerAction
} from '../../../shared/plugin-settings-viewer-command'

type Form = {
  pathInput: string
  paths: readonly string[]
  busy: boolean
  error: string | null
  setPathInput: (value: string) => void
}
type State = {
  pathInput: string
  paths: readonly string[]
  expanded: boolean
  busy: boolean
  error: string | null
}
type Control = (action: PluginDevelopmentViewerAction) => Promise<State>
const mountedSections = new Set<Control>()
export async function applyPluginDevelopmentViewerAction(
  action: PluginDevelopmentViewerAction
): Promise<State> {
  const parsed = PluginDevelopmentViewerActionSchema.parse(action)
  if (mountedSections.size !== 1) {
    throw new Error(mountedSections.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedSections.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function usePluginDevelopmentViewerController(
  form: Form
): RefObject<HTMLDetailsElement | null> {
  const details = useRef<HTMLDetailsElement>(null)
  const latest = useRef(form)
  const [, setRevision] = useState(0)
  const pending = useRef<{
    resolve: (state: State) => void
    reject: (error: Error) => void
  } | null>(null)
  const snapshot = (): State => {
    if (!details.current) {
      throw new Error('viewer_unavailable')
    }
    const current = latest.current
    return {
      pathInput: current.pathInput,
      paths: current.paths,
      expanded: details.current.open,
      busy: current.busy,
      error: current.error
    }
  }
  useLayoutEffect(() => {
    latest.current = form
  })
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    pending.current = null
    request.resolve(snapshot())
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot()
      }
      if (pending.current || current.busy) {
        throw new Error('viewer_busy')
      }
      const section = details.current
      if (!section) {
        throw new Error('viewer_unavailable')
      }
      if (action.kind === 'input' && !section.open) {
        throw new Error('plugin_development_collapsed')
      }
      return new Promise((resolve, reject) => {
        pending.current = { resolve, reject }
        if (action.kind === 'expanded') {
          section.open = action.value
        } else {
          current.setPathInput(action.value)
        }
        setRevision((value) => value + 1)
      })
    }
    mountedSections.add(control)
    return () => {
      mountedSections.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
  return details
}
