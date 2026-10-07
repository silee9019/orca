import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { BrowserSshRouteEvent } from '@/runtime/browser-ssh-route-request'
import type { BrowserSshRouteReceipt } from '../../../../shared/rpc-contract/browser-ssh-route-params'
import type { SshWorkspaceBrowserRouteState } from './use-ssh-workspace-browser-route'
type Owner = {
  worktreeId: string
  pageIds: readonly string[]
  targetId: string | null
  profileId: string
  state: SshWorkspaceBrowserRouteState
  attempt: number
  retry: () => void
  tryWithoutProbe: () => void
  browseFromThisDevice: () => void
}
type Pending = {
  event: BrowserSshRouteEvent
  attempt: number
  resolve: (value: BrowserSshRouteReceipt) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}
function matches(owner: Owner, event: BrowserSshRouteEvent): boolean {
  const state = useAppStore.getState()
  const target = event.command
  const page = findPage(state.browserPagesByWorkspace, target.page)
  return Boolean(
    owner.worktreeId === target.worktreeId &&
    owner.pageIds.includes(target.page) &&
    owner.targetId === target.targetId &&
    owner.profileId === target.profileId &&
    page?.worktreeId === target.worktreeId &&
    !page.browserRuntimeEnvironmentId &&
    !state.remoteBrowserPageHandlesByPageId[target.page] &&
    state.activeWorktreeId === target.worktreeId &&
    state.activeModal === 'none' &&
    state.settings !== null &&
    !state.settings.activeRuntimeEnvironmentId &&
    state.browserTabsByWorktree[target.worktreeId]?.some((tab) => tab.activePageId === target.page)
  )
}
export function useBrowserSshRouteCommands(owner: Owner): void {
  const current = useRef(owner)
  const pending = useRef<Pending | null>(null)
  const finish = (error?: Error) => {
    const task = pending.current
    if (!task) {
      return
    }
    pending.current = null
    clearTimeout(task.timer)
    if (error) {
      task.reject(error)
    } else {
      task.resolve({
        ...task.event.command,
        accepted: true,
        attempt: current.current.attempt,
        routeState: current.current.state.kind
      })
    }
  }
  useLayoutEffect(() => {
    current.current = owner
    const task = pending.current
    if (!task) {
      return
    }
    if (Date.now() >= task.event.expiresAt || !matches(owner, task.event)) {
      finish(new Error('browser_ssh_route_owner_changed_effect_unknown'))
      return
    }
    const settings = useAppStore.getState().settings
    const target = task.event.command
    if (target.action === 'browse-local') {
      if (
        owner.state.kind === 'unrouted' &&
        settings?.browserSshWorkspaceRoutingDisabledTargetIds?.includes(target.targetId)
      ) {
        finish()
      }
    } else if (
      owner.attempt > task.attempt &&
      (target.action !== 'try-without-probe' ||
        settings?.browserSshWorkspaceRoutingProbeSkippedTargetIds?.includes(target.targetId))
    ) {
      finish()
    }
  })
  useEffect(() => {
    const receive = (event: Event) => {
      if (!(event instanceof BrowserSshRouteEvent) || !matches(current.current, event)) {
        return
      }
      event.offers.push(() => {
        const before = current.current
        if (pending.current) {
          return Promise.reject(new Error('browser_ssh_route_busy'))
        }
        if (
          Date.now() >= event.expiresAt ||
          !matches(before, event) ||
          before.state.kind !== 'error' ||
          before.state.errorKind !== event.command.errorKind
        ) {
          return Promise.reject(new Error('browser_ssh_route_state_changed'))
        }
        if (
          event.command.action === 'try-without-probe' &&
          before.state.errorKind !== 'forwarding-blocked'
        ) {
          return Promise.reject(new Error('browser_ssh_route_probe_override_unavailable'))
        }
        return new Promise<BrowserSshRouteReceipt>((resolve, reject) => {
          pending.current = {
            event,
            attempt: before.attempt,
            resolve,
            reject,
            timer: setTimeout(
              () => finish(new Error('browser_ssh_route_expired_effect_unknown')),
              Math.max(0, event.expiresAt - Date.now())
            )
          }
          try {
            if (event.command.action === 'retry') {
              before.retry()
            } else if (event.command.action === 'try-without-probe') {
              before.tryWithoutProbe()
            } else {
              before.browseFromThisDevice()
            }
          } catch {
            finish(new Error('browser_ssh_route_callback_failed_effect_unknown'))
          }
        })
      })
    }
    window.addEventListener('orca:browser-ssh-route', receive)
    return () => {
      window.removeEventListener('orca:browser-ssh-route', receive)
      finish(new Error('browser_ssh_route_unmounted_effect_unknown'))
    }
  }, [])
}
