import type { SshViewerSurface } from '../../../shared/rpc-contract/connections-viewer-params'
import { useEffect, useRef } from 'react'
import {
  mountSshConnectionsViewerController,
  mountSshAdvancedViewerController,
  type SshConnectionsViewerController
} from '@/runtime/ssh-connections-viewer-controller'
export function useSshConnectionsViewerController(
  controller: SshConnectionsViewerController,
  surface: SshViewerSurface = 'settings',
  enabled = true
): void {
  const committed = useRef(controller)
  const supportsActions = controller.actions !== undefined
  const supportsConfig = controller.config !== undefined
  useEffect(() => {
    committed.current = controller
  })
  useEffect(() => {
    if (!enabled) {
      return
    }
    return mountSshConnectionsViewerController(
      {
        read: () => committed.current.read(),
        matchesDraft: (draft) => committed.current.matchesDraft(draft),
        open: () => committed.current.open(),
        edit: (id) => committed.current.edit(id),
        cancel: () => committed.current.cancel(),
        draft: (updates) => committed.current.draft(updates),
        save: () => committed.current.save(),
        normalize: () => committed.current.normalize?.() ?? null,
        ...(supportsActions
          ? {
              actions: {
                connect: (id: string) =>
                  committed.current.actions?.connect(id) ?? Promise.resolve(false),
                disconnect: (id: string) =>
                  committed.current.actions?.disconnect(id) ?? Promise.resolve(false),
                test: (id: string) => committed.current.actions?.test(id) ?? Promise.resolve(false),
                import: () => committed.current.actions?.import() ?? Promise.resolve(null),
                matchesImported: (targets) =>
                  committed.current.actions?.matchesImported(targets) ?? false,
                matchesConnection: (operation, id) =>
                  committed.current.actions?.matchesConnection(operation, id) ?? false
              }
            }
          : {}),
        ...(supportsConfig
          ? {
              config: {
                open: () => committed.current.config?.open() ?? Promise.resolve(null),
                search: (query: string, refresh: boolean) =>
                  committed.current.config?.search(query, refresh) ?? Promise.resolve(null),
                select: (alias: string) =>
                  committed.current.config?.select(alias) ?? Promise.resolve(null),
                importNew: () =>
                  committed.current.config?.importNew() ?? Promise.resolve('failed' as const),
                matchesList: (result, query) =>
                  committed.current.config?.matchesList(result, query) ?? false
              }
            }
          : {})
      },
      surface
    )
  }, [surface, enabled, supportsConfig, supportsActions])
}
export function useSshAdvancedViewerController(
  open: boolean,
  expanded: boolean,
  set: (value: boolean) => void,
  surface: SshViewerSurface = 'settings'
): void {
  const committed = useRef({ expanded, set })
  useEffect(() => {
    committed.current = { expanded, set }
  })
  useEffect(() => {
    if (!open) {
      return
    }
    return mountSshAdvancedViewerController(
      {
        read: () => committed.current.expanded,
        set: (value) => committed.current.set(value)
      },
      surface
    )
  }, [open, surface])
}
