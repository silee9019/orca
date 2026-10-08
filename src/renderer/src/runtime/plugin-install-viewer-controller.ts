import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PluginInstallViewerActionSchema,
  type PluginInstallViewerAction
} from '../../../shared/plugin-settings-viewer-command'

type Form = {
  open: boolean
  sourceKind: 'local-path' | 'git'
  localPath: string
  gitUrl: string
  error: string | null
  installing: boolean
  setKind: (value: 'local-path' | 'git') => void
  setLocalPath: (value: string) => void
  setGitUrl: (value: string) => void
  clearError: () => void
  submit: () => Promise<boolean>
  close: () => void
}
function snapshot(form: Form) {
  return {
    sourceKind: form.sourceKind,
    localPath: form.localPath,
    gitUrlSet: Boolean(form.gitUrl),
    error: form.error,
    installing: form.installing
  }
}
export type PluginInstallViewerState = ReturnType<typeof snapshot> & {
  accepted?: boolean
  closed?: boolean
}
type Control = (action: PluginInstallViewerAction) => Promise<PluginInstallViewerState>
const mountedForms = new Set<Control>()
export async function applyPluginInstallViewerAction(
  action: PluginInstallViewerAction
): Promise<PluginInstallViewerState> {
  const parsed = PluginInstallViewerActionSchema.parse(action)
  if (mountedForms.size !== 1) {
    throw new Error(mountedForms.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedForms.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function usePluginInstallViewerController(form: Form): void {
  const latest = useRef(form)
  const busy = useRef(false)
  const [, setRevision] = useState(0)
  const pending = useRef<{
    resolve: (state: PluginInstallViewerState) => void
    reject: (error: Error) => void
  } | null>(null)
  useLayoutEffect(() => {
    latest.current = form
  })
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
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
      if (busy.current || pending.current || current.installing) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'close') {
        current.close()
        return { ...snapshot(current), closed: true }
      }
      if (action.kind === 'submit') {
        busy.current = true
        try {
          if (!(await current.submit())) {
            throw new Error('plugin_install_failed')
          }
          return { ...snapshot(current), installing: false, error: null, accepted: true }
        } finally {
          busy.current = false
        }
      }
      return new Promise((resolve, reject) => {
        pending.current = { resolve, reject }
        switch (action.kind) {
          case 'source-kind':
            current.setKind(action.value)
            current.clearError()
            break
          case 'local-path':
            current.setLocalPath(action.value)
            break
          case 'git-url':
            current.setGitUrl(action.value)
            break
        }
        setRevision((value) => value + 1)
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
