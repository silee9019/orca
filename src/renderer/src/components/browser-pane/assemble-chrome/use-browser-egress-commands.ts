import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { BrowserEgressEvent } from '@/runtime/browser-egress-request'
import { matchesBrowserClientPageCommandTarget } from '@/runtime/browser-client-page-command-target'
import type { RuntimeBrowserClientPlacement } from '../../../../../shared/runtime-browser-placement'
import type { BrowserEgressState } from '../../../../../shared/rpc-contract/browser-egress-params'
export type BrowserEgressOwner = {
  page: string
  isActive: boolean
  clientPlacement?: RuntimeBrowserClientPlacement | null
}
type Owner = {
  identity?: BrowserEgressOwner
  route:
    | { kind: 'ssh'; executionHostId: string; egress: 'ssh' | 'local' }
    | { kind: 'client' | 'streamed'; environmentId: string }
  open: boolean
  settingsSectionId: string
  setOpen: (open: boolean) => void
  openSettings: () => void
}
type Pending = { event: BrowserEgressEvent; check: () => void; finish: (error?: Error) => void }
export function useBrowserEgressCommands(owner: Owner): void {
  const current = useRef(owner)
  const pending = useRef<Pending | null>(null)
  const [, update] = useState(0)
  const checkPending = () => {
    const operation = pending.current
    if (!operation) {
      return
    }
    try {
      operation.check()
    } catch (error) {
      operation.finish(error instanceof Error ? error : new Error(String(error)))
    }
  }
  useLayoutEffect(() => {
    current.current = owner
    checkPending()
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    try {
      operation.check()
      if (current.current.open !== (operation.event.command.action === 'open')) {
        throw new Error('browser_egress_effect_unknown')
      }
      operation.finish()
    } catch (error) {
      operation.finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
  useEffect(() => {
    let mounted = true
    const receive = (raw: Event) => {
      if (!(raw instanceof BrowserEgressEvent)) {
        return
      }
      const event = raw
      const before = current.current
      if (!before.identity?.isActive || before.identity.page !== event.command.page) {
        return
      }
      const pageBefore = findPage(
        useAppStore.getState().browserPagesByWorkspace,
        event.command.page
      )
      event.offers.push(async () => {
        let started = false
        const check = () => {
          const latest = current.current
          const state = useAppStore.getState()
          const page = findPage(state.browserPagesByWorkspace, event.command.page)
          const target = event.command.target
          const route = latest.route
          const handle = state.remoteBrowserPageHandlesByPageId[event.command.page]
          const group = state.groupsByWorktree[event.command.worktreeId]?.find(
            (entry) => entry.id === state.activeGroupIdByWorktree[event.command.worktreeId]
          )
          const tab = state.unifiedTabsByWorktree[event.command.worktreeId]?.find(
            (entry) => entry.id === group?.activeTabId
          )
          if (!mounted) {
            throw new Error('browser_egress_disposed_effect_unknown')
          }
          if (Date.now() >= event.expiresAt) {
            throw new Error('browser_egress_expired_effect_unknown')
          }
          if (!started && before !== latest) {
            throw new Error('browser_egress_owner_changed')
          }
          if (
            !latest.identity?.isActive ||
            latest.identity.page !== event.command.page ||
            !page ||
            !pageBefore ||
            page.url !== pageBefore.url ||
            page.workspaceId !== pageBefore.workspaceId ||
            page.worktreeId !== event.command.worktreeId ||
            state.activeWorktreeId !== event.command.worktreeId ||
            !state.settings ||
            !state.persistedUIReady ||
            state.activeModal !== 'none' ||
            state.activeView !== 'terminal' ||
            tab?.contentType !== 'browser' ||
            tab.entityId !== page.workspaceId ||
            !state.browserTabsByWorktree[event.command.worktreeId]?.some(
              (workspace) => workspace.id === page.workspaceId && workspace.activePageId === page.id
            )
          ) {
            throw new Error('browser_egress_target_changed')
          }
          if (target.kind === 'ssh') {
            if (
              route.kind !== 'ssh' ||
              route.executionHostId !== target.executionHostId ||
              route.egress !== target.egress ||
              handle ||
              getExecutionHostIdForWorktree(state, event.command.worktreeId) !==
                target.executionHostId
            ) {
              throw new Error('browser_egress_host_changed')
            }
          } else {
            if (
              route.kind === 'ssh' ||
              route.kind !== target.kind ||
              route.environmentId !== target.environmentId
            ) {
              throw new Error('browser_egress_host_changed')
            }
            if (target.kind === 'client') {
              if (
                !matchesBrowserClientPageCommandTarget(
                  handle,
                  target.environmentId,
                  target.clientTarget,
                  latest.identity.clientPlacement ?? null
                )
              ) {
                throw new Error('browser_egress_client_changed')
              }
            } else if (
              !handle ||
              handle.environmentId !== target.environmentId ||
              handle.remotePageId !== target.remotePageId ||
              handle.placement?.kind !== 'server' ||
              handle.staged ||
              handle.stagedClientHosted ||
              handle.restoredFromSession ||
              handle.restoredClientHosted
            ) {
              throw new Error('browser_egress_stream_changed')
            }
          }
        }
        const snapshot = (settingsOpened = false): BrowserEgressState => ({
          page: event.command.page,
          worktreeId: event.command.worktreeId,
          open: settingsOpened ? false : current.current.open,
          settingsOpened
        })
        check()
        if (pending.current) {
          throw new Error('browser_egress_busy')
        }
        if (event.command.action === 'status') {
          return snapshot()
        }
        started = true
        if (event.command.action === 'settings') {
          before.openSettings()
          const state = useAppStore.getState()
          if (
            state.activeView !== 'settings' ||
            state.settingsNavigationTarget?.pane !== 'browser' ||
            state.settingsNavigationTarget.repoId !== null ||
            state.settingsNavigationTarget.sectionId !== before.settingsSectionId
          ) {
            throw new Error('browser_egress_settings_effect_unknown')
          }
          return snapshot(true)
        }
        return new Promise<BrowserEgressState>((resolve, reject) => {
          const operation: Pending = {
            event,
            check,
            finish: (error) => {
              if (pending.current !== operation) {
                return
              }
              pending.current = null
              clearTimeout(timer)
              if (error) {
                reject(error)
              } else {
                resolve(snapshot())
              }
            }
          }
          const timer = setTimeout(
            () => operation.finish(new Error('browser_egress_expired_effect_unknown')),
            Math.max(0, event.expiresAt - Date.now())
          )
          pending.current = operation
          try {
            check()
            before.setOpen(event.command.action === 'open')
            update((value) => value + 1)
          } catch (error) {
            operation.finish(error instanceof Error ? error : new Error(String(error)))
          }
        })
      })
    }
    const unsubscribe = useAppStore.subscribe(checkPending)
    window.addEventListener('orca:browser-egress', receive)
    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('orca:browser-egress', receive)
      pending.current?.finish(new Error('browser_egress_disposed_effect_unknown'))
    }
  }, [])
}
