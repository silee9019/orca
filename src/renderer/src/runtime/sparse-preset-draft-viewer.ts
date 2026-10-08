import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SparsePresetViewerAction } from '../../../shared/sparse-preset-viewer-command'
import { normalizeSparseDirectoryLines } from '@/lib/sparse-paths'
import {
  addSparseDirectoryEntries,
  parseSparseDirectoryEntryInput
} from '../components/sparse/sparse-directory-entry-input'
type Scope = { repoId: string; ownerKey: string }
type Action = Extract<
  SparsePresetViewerAction,
  { kind: 'name-touch' | 'directories-add' | 'directory-remove' }
>
type Form = {
  scope?: Scope
  directoriesText: string
  nameTouched: boolean
  submitting: boolean
  setNameTouched: (value: boolean) => void
  addDirectories: (values: string[]) => void
  removeDirectory: (value: string) => void
}
type State = { nameTouched: boolean; directories: string[] }
type Control = { scope: Scope; get: () => State; apply: (action: Action) => Promise<void> }
const mounted = new Set<Control>()
function controls(repoId: string, ownerKey: string): Control[] {
  return [...mounted].filter(
    (entry) => entry.scope.repoId === repoId && entry.scope.ownerKey === ownerKey
  )
}
export function sparsePresetDraftSnapshot(repoId: string, ownerKey: string): State | null {
  const candidates = controls(repoId, ownerKey)
  return candidates.length === 1 ? candidates[0].get() : null
}
export async function applySparsePresetDraftControl(
  repoId: string,
  ownerKey: string,
  action: Action
): Promise<void> {
  const candidates = controls(repoId, ownerKey)
  if (candidates.length !== 1) {
    throw new Error(candidates.length ? 'viewer_ambiguous' : 'sparse_preset_editor_closed')
  }
  return candidates[0].apply(action)
}
export function useSparsePresetDraftViewer(form: Form): void {
  const repoId = form.scope?.repoId
  const ownerKey = form.scope?.ownerKey
  const latest = useRef(form)
  const pending = useRef<{
    expected: State
    resolve: () => void
    reject: (error: Error) => void
  } | null>(null)
  const [, setRevision] = useState(0)
  const get = () => ({
    nameTouched: latest.current.nameTouched,
    directories: normalizeSparseDirectoryLines(latest.current.directoriesText)
  })
  useLayoutEffect(() => {
    latest.current = form
  })
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    pending.current = null
    if (JSON.stringify(request.expected) !== JSON.stringify(get())) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve()
    }
  })
  useEffect(() => {
    if (!repoId || ownerKey === undefined) {
      return
    }
    const control: Control = {
      scope: { repoId, ownerKey },
      get,
      apply: async (action) => {
        if (pending.current || latest.current.submitting) {
          throw new Error('viewer_busy')
        }
        const current = get()
        let directories: string[] = []
        if (action.kind === 'directories-add') {
          const parsed = parseSparseDirectoryEntryInput(action.directories.join('\n'))
          if (parsed.error || !parsed.entries.length) {
            throw new Error('sparse_directory_invalid')
          }
          directories = parsed.entries
        }
        if (action.kind === 'directory-remove' && !current.directories.includes(action.directory)) {
          throw new Error('sparse_directory_not_selected')
        }
        const expected = {
          nameTouched: action.kind === 'name-touch' ? true : current.nameTouched,
          directories:
            action.kind === 'directories-add'
              ? addSparseDirectoryEntries(current.directories, directories)
              : action.kind === 'directory-remove'
                ? current.directories.filter((entry) => entry !== action.directory)
                : current.directories
        }
        return new Promise<void>((resolve, reject) => {
          pending.current = { expected, resolve, reject }
          if (action.kind === 'name-touch') {
            latest.current.setNameTouched(true)
          } else if (action.kind === 'directories-add') {
            latest.current.addDirectories(directories)
          } else {
            latest.current.removeDirectory(action.directory)
          }
          setRevision((value) => value + 1)
        })
      }
    }
    mounted.add(control)
    return () => {
      mounted.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [repoId, ownerKey])
}
