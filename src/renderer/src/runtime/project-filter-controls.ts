import type { ProjectFilterControl } from '../../../shared/rpc-contract/workspace-filter-params'

export type ProjectFilterControlSnapshot = {
  open: boolean
  query: string
  highlightedRepoId: string
  resultRepoIds: string[]
  inputFocused: boolean
}
type FilterControl = {
  snapshot: ProjectFilterControlSnapshot
  apply: (command: ProjectFilterControl) => void
}
const controls = new Map<ProjectFilterControl['surface'], Set<FilterControl>>()
const listeners = new Set<() => void>()

export function readProjectFilterControl(
  surface: ProjectFilterControl['surface']
): ProjectFilterControlSnapshot {
  const mounted = controls.get(surface)
  if (!mounted?.size) {
    throw new Error('filter_surface_unavailable')
  }
  if (mounted.size !== 1) {
    throw new Error('filter_surface_ambiguous')
  }
  const control = [...mounted][0]
  if (!control) {
    throw new Error('filter_surface_unavailable')
  }
  if (!control.snapshot.open) {
    throw new Error('filter_menu_closed')
  }
  return { ...control.snapshot, resultRepoIds: [...control.snapshot.resultRepoIds] }
}

export function publishProjectFilterControl(
  surface: ProjectFilterControl['surface'],
  control: FilterControl
): () => void {
  let mounted = controls.get(surface)
  if (!mounted) {
    mounted = new Set()
    controls.set(surface, mounted)
  }
  mounted.add(control)
  for (const listener of listeners) {
    listener()
  }
  return () => {
    mounted.delete(control)
  }
}

export async function requestProjectFilterControl(
  command: ProjectFilterControl,
  expiresAt: number
): Promise<ProjectFilterControlSnapshot> {
  const mounted = controls.get(command.surface)
  if (!mounted?.size) {
    throw new Error('filter_surface_unavailable')
  }
  if (mounted.size !== 1) {
    throw new Error('filter_surface_ambiguous')
  }
  const control = [...mounted][0]
  if (!control) {
    throw new Error('filter_surface_unavailable')
  }
  if (Date.now() >= expiresAt) {
    throw new Error('request_expired')
  }
  if (command.action !== 'menu' && !control.snapshot.open) {
    throw new Error('filter_menu_closed')
  }
  if (command.action === 'highlight' && !control.snapshot.resultRepoIds.includes(command.repoId)) {
    throw new Error('project_not_in_results')
  }
  const matches = (snapshot: ProjectFilterControlSnapshot): boolean => {
    switch (command.action) {
      case 'menu':
        return snapshot.open === command.open && (command.open || snapshot.query === '')
      case 'search':
        return snapshot.query === command.query
      case 'highlight':
        return snapshot.highlightedRepoId === command.repoId
      case 'focus':
        return snapshot.inputFocused
    }
  }
  return new Promise((resolve, reject) => {
    const finish = (snapshot?: ProjectFilterControlSnapshot): void => {
      clearTimeout(timer)
      listeners.delete(check)
      if (snapshot) {
        resolve({ ...snapshot, resultRepoIds: [...snapshot.resultRepoIds] })
      } else {
        reject(new Error('filter_control_not_applied'))
      }
    }
    const check = (): void => {
      const active = controls.get(command.surface)
      if (active?.size !== 1 || Date.now() >= expiresAt) {
        return
      }
      const current = [...active][0]
      if (current && matches(current.snapshot)) {
        finish(current.snapshot)
      }
    }
    const timer = setTimeout(() => finish(), Math.max(0, Math.min(2000, expiresAt - Date.now())))
    listeners.add(check)
    try {
      control.apply(command)
      check()
    } catch (error) {
      clearTimeout(timer)
      listeners.delete(check)
      reject(error)
    }
  })
}
