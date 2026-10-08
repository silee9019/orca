import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import {
  isBrowserAutomationVisible,
  onBrowserAutomationVisibilityChange
} from '@/components/browser-pane/host-guest/browser-automation-visibility'
import {
  getDriverForBrowserPage,
  onBrowserDriverChange
} from '@/lib/pane-manager/browser-mobile-driver-state'
import {
  BrowserObservationCommand,
  type BrowserObservationState
} from '../../../shared/rpc-contract/browser-observation-params'
class BrowserObservationEvent extends Event {
  readonly offers: (() => Promise<BrowserObservationState>)[] = []
  constructor(
    readonly command: BrowserObservationCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-observation')
  }
}
export function requestBrowserObservation(
  command: BrowserObservationCommand,
  expiresAt: number
): Promise<BrowserObservationState> {
  const event = new BrowserObservationEvent(BrowserObservationCommand.parse(command), expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    return Promise.reject(
      new Error(
        event.offers.length ? 'browser_observation_ambiguous' : 'browser_observation_unavailable'
      )
    )
  }
  return event.offers[0]()
}
export function attachBrowserObservationOwner(
  kind: BrowserObservationCommand['kind'],
  isRuntimeEnvironmentActive: () => boolean,
  isReady: () => boolean = () => true
): () => void {
  let disposed = false
  const pending = new Set<(error: Error) => void>()
  const receive = (event: Event) => {
    if (!(event instanceof BrowserObservationEvent) || event.command.kind !== kind) {
      return
    }
    event.offers.push(async () => {
      const { command, expiresAt } = event
      const before = findPage(useAppStore.getState().browserPagesByWorkspace, command.page)
      const check = () => {
        const state = useAppStore.getState()
        const page = findPage(state.browserPagesByWorkspace, command.page)
        if (disposed) {
          throw new Error('browser_observation_disposed')
        }
        if (Date.now() >= expiresAt) {
          throw new Error('browser_observation_expired')
        }
        if (!isReady() || !state.settings || !state.persistedUIReady) {
          throw new Error('browser_observation_not_ready')
        }
        if (
          isRuntimeEnvironmentActive() ||
          state.settings?.activeRuntimeEnvironmentId ||
          !before ||
          !page ||
          page.workspaceId !== before.workspaceId ||
          page.worktreeId !== command.worktreeId ||
          page.browserRuntimeEnvironmentId ||
          state.remoteBrowserPageHandlesByPageId[command.page]
        ) {
          throw new Error('browser_observation_target_changed')
        }
      }
      const snapshot = (changed: boolean): BrowserObservationState =>
        kind === 'visibility'
          ? {
              kind,
              page: command.page,
              worktreeId: command.worktreeId,
              changed,
              automationVisible: isBrowserAutomationVisible(command.page)
            }
          : {
              kind,
              page: command.page,
              worktreeId: command.worktreeId,
              changed,
              driver: getDriverForBrowserPage(command.page)
            }
      check()
      const initial = snapshot(false)
      if (command.waitMs === 0) {
        return initial
      }
      return new Promise<BrowserObservationState>((resolve, reject) => {
        let settled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const unsubs: (() => void)[] = []
        const fail = (error: Error) => finish(undefined, error)
        const finish = (value?: BrowserObservationState, error?: Error) => {
          if (settled) {
            return
          }
          settled = true
          clearTimeout(timer)
          for (const unsubscribe of unsubs) {
            unsubscribe()
          }
          pending.delete(fail)
          if (error) {
            reject(error)
          } else if (value) {
            resolve(value)
          }
        }
        const sample = (timeout = false) => {
          try {
            check()
            const value = snapshot(false)
            const changed = JSON.stringify(value) !== JSON.stringify(initial)
            if (changed || timeout) {
              finish({ ...value, changed })
            }
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)))
          }
        }
        pending.add(fail)
        unsubs.push(
          kind === 'visibility'
            ? onBrowserAutomationVisibilityChange(() => sample())
            : onBrowserDriverChange(() => sample())
        )
        unsubs.push(useAppStore.subscribe(() => sample()))
        timer = setTimeout(
          () => sample(true),
          Math.min(command.waitMs, Math.max(0, expiresAt - Date.now()))
        )
        sample()
      })
    })
  }
  window.addEventListener('orca:browser-observation', receive)
  return () => {
    if (disposed) {
      return
    }
    disposed = true
    window.removeEventListener('orca:browser-observation', receive)
    for (const fail of pending) {
      fail(new Error('browser_observation_disposed'))
    }
  }
}
