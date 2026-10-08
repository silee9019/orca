import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { BrowserTitlebarPairedActivationEvent } from '@/runtime/browser-titlebar-paired-activation-request'
import { isBrowserTitlebarPairedActivationTargetCurrent } from './browser-titlebar-paired-activation-target'
import type { BrowserTitlebarPairedActivationState } from '../../../shared/rpc-contract/browser-titlebar-paired-activation-params'
type Owner = {
  worktreeId: string | null
  visible: boolean
  activate: (
    workspace: string,
    onSubmitted?: (pending: Promise<boolean>) => void,
    expectedHostTabId?: string,
    assertCurrentActivation?: () => void
  ) => void
}
export function useBrowserTitlebarPairedActivationCommands(owner: Owner): void {
  const latest = useRef(owner)
  const epoch = useRef(0)
  const busy = useRef(false)
  const pending = useRef<{ reject: (error: Error) => void; check: () => void } | null>(null)
  useLayoutEffect(() => {
    latest.current = owner
  })
  useLayoutEffect(() => {
    epoch.current++
    pending.current?.reject(new Error('browser_titlebar_activation_owner_changed_effect_unknown'))
  }, [owner.worktreeId, owner.visible, owner.activate])
  useEffect(() => {
    let mounted = true
    const receive = (raw: Event): void => {
      if (
        !(raw instanceof BrowserTitlebarPairedActivationEvent) ||
        latest.current.worktreeId !== raw.commandTarget.worktree ||
        !latest.current.visible
      ) {
        return
      }
      const event = raw
      const version = epoch.current
      event.offers.push(
        () =>
          new Promise<BrowserTitlebarPairedActivationState>((resolve, reject) => {
            const target = event.commandTarget
            let invalidated = false
            let submitted = false
            let acquired = false
            let handedOff = false
            let settled = false
            let timer: ReturnType<typeof setTimeout> | undefined
            const finish = (error?: Error): void => {
              if (settled) {
                return
              }
              settled = true
              if (timer !== undefined) {
                clearTimeout(timer)
              }
              if (pending.current?.check === check) {
                pending.current = null
              }
              if (error) {
                reject(error)
              } else {
                resolve({
                  target,
                  hostAcknowledged: true,
                  callerNavigation: true,
                  activeGroup: target.group,
                  activeWorkspace: target.workspace,
                  activeTab: target.unifiedTab,
                  activeType: 'browser',
                  nativeWindowVerified: false
                })
              }
            }
            const check = (): void => {
              const current = latest.current
              if (
                !mounted ||
                epoch.current !== version ||
                !current.visible ||
                current.worktreeId !== target.worktree ||
                invalidated ||
                !isBrowserTitlebarPairedActivationTargetCurrent(target)
              ) {
                invalidated = true
                throw new Error('browser_titlebar_activation_owner_changed_effect_unknown')
              }
              if (Date.now() >= event.expiresAt) {
                throw new Error('browser_titlebar_activation_expired_effect_unknown')
              }
              if (submitted) {
                const state = useAppStore.getState()
                const group = state.groupsByWorktree[target.worktree]?.find(
                  (group) => group.id === target.group
                )
                if (
                  state.activeBrowserTabIdByWorktree[target.worktree] !== target.workspace ||
                  group?.activeTabId !== target.unifiedTab ||
                  state.activeTabTypeByWorktree[target.worktree] !== 'browser'
                ) {
                  invalidated = true
                  throw new Error('browser_titlebar_activation_selection_changed_effect_unknown')
                }
              }
            }
            try {
              check()
              if (busy.current) {
                throw new Error('browser_titlebar_activation_busy')
              }
              busy.current = true
              acquired = true
              pending.current = { reject: finish, check }
              timer = setTimeout(
                () => finish(new Error('browser_titlebar_activation_expired_effect_unknown')),
                Math.max(0, event.expiresAt - Date.now())
              )
              let acknowledgment: Promise<boolean> | undefined
              latest.current.activate(
                target.workspace,
                (promise) => {
                  acknowledgment = promise
                  handedOff = true
                  void promise
                    .finally(() => {
                      busy.current = false
                    })
                    .catch(() => {})
                },
                target.hostTabId,
                check
              )
              submitted = true
              check()
              if (!acknowledgment) {
                throw new Error('browser_titlebar_activation_unacknowledged')
              }
              void acknowledgment
                .then(
                  (accepted) => {
                    try {
                      check()
                      if (!accepted) {
                        throw new Error('browser_titlebar_activation_unacknowledged')
                      }
                      finish()
                    } catch (error) {
                      finish(
                        error instanceof Error
                          ? error
                          : new Error('browser_titlebar_activation_failed_effect_unknown')
                      )
                    }
                  },
                  (error) =>
                    finish(
                      error instanceof Error
                        ? error
                        : new Error('browser_titlebar_activation_failed_effect_unknown')
                    )
                )
                .finally(() => {
                  busy.current = false
                })
            } catch (error) {
              if (acquired && !handedOff) {
                busy.current = false
              }
              finish(
                error instanceof Error
                  ? error
                  : new Error('browser_titlebar_activation_failed_effect_unknown')
              )
            }
          })
      )
    }
    const unsubscribe = useAppStore.subscribe(() => {
      try {
        pending.current?.check()
      } catch (error) {
        pending.current?.reject(
          error instanceof Error
            ? error
            : new Error('browser_titlebar_activation_failed_effect_unknown')
        )
      }
    })
    window.addEventListener('orca:browser-titlebar-paired-activation', receive)
    return () => {
      mounted = false
      unsubscribe()
      window.removeEventListener('orca:browser-titlebar-paired-activation', receive)
      pending.current?.reject(new Error('browser_titlebar_activation_unmounted_effect_unknown'))
    }
  }, [])
}
