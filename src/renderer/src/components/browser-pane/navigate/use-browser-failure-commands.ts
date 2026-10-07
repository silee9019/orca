import { openBrowserTabExternallyVerified } from '@/components/tab-bar/browser-tab-external-open'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { findPage } from '@/store/slices/browser-page-records'
import { BrowserFailureEvent } from '@/runtime/browser-failure-request'
import type {
  BrowserCertificateProceedResult,
  BrowserLoadError,
  BrowserPage
} from '../../../../../shared/browser-workspace-types'
import type { BrowserFailureState } from '../../../../../shared/rpc-contract/browser-failure-params'
export function openBrowserFailureExternalUrl(url: string, verified = false): Promise<void> {
  return verified
    ? openBrowserTabExternallyVerified(window.api.shell, url)
    : window.api.shell.openUrl(url)
}
export type BrowserFailureOwner = {
  page: string
  worktreeId: string
  placement: 'local' | 'client-hosted'
  environmentId: string | null
}
export function createBrowserFailureOwner(
  page: Pick<BrowserPage, 'id' | 'worktreeId'>,
  environmentId: string | null = null,
  active = true
): BrowserFailureOwner | undefined {
  if (!active) {
    return undefined
  }
  return {
    page: page.id,
    worktreeId: page.worktreeId,
    placement: environmentId ? 'client-hosted' : 'local',
    environmentId
  }
}
type Owner = {
  identity?: BrowserFailureOwner
  url: string
  error: BrowserLoadError
  challenge: string | null
  disabled: boolean
  copy: () => void | Promise<void>
  external?: () => void | Promise<void>
  proceed: () => Promise<BrowserCertificateProceedResult>
}
export function useBrowserFailureCommands(owner: Owner): void {
  const current = useRef(owner)
  const pending = useRef<((error: Error) => void) | null>(null)
  useLayoutEffect(() => {
    current.current = owner
  })
  useEffect(() => {
    let mounted = true
    const receive = (event: Event) => {
      if (
        !(event instanceof BrowserFailureEvent) ||
        event.page !== current.current.identity?.page
      ) {
        return
      }
      event.offers.push(async () => {
        const before = current.current
        const command = event.command
        const matches = (value: Owner): boolean => {
          const state = useAppStore.getState()
          const page = findPage(state.browserPagesByWorkspace, event.page)
          return Boolean(
            mounted &&
            value.identity &&
            page &&
            page.worktreeId === command.worktreeId &&
            state.activeWorktreeId === command.worktreeId &&
            !state.remoteBrowserPageHandlesByPageId[event.page] &&
            (page.browserRuntimeEnvironmentId ?? null) === command.environmentId &&
            state.activeModal === 'none' &&
            page.loadError?.code === command.errorCode &&
            page.loadError.validatedUrl === value.error.validatedUrl &&
            page.loadError.description === value.error.description &&
            value.error.validatedUrl === before.error.validatedUrl &&
            value.identity.worktreeId === command.worktreeId &&
            value.identity.placement === command.placement &&
            value.identity.environmentId === command.environmentId &&
            value.url === command.expectedUrl &&
            value.error.code === command.errorCode &&
            value.error.description === before.error.description &&
            value.challenge === before.challenge &&
            state.browserTabsByWorktree[command.worktreeId]?.some(
              (tab) => tab.activePageId === event.page
            )
          )
        }
        if (pending.current || before.disabled || useAppStore.getState().activeModal !== 'none') {
          throw new Error('browser_failure_busy')
        }
        if (Date.now() >= event.expiresAt || !matches(before)) {
          throw new Error('browser_failure_owner_changed')
        }
        if (
          command.action === 'certificate-proceed' &&
          (!command.challengeId || command.challengeId !== before.challenge)
        ) {
          throw new Error('browser_failure_challenge_mismatch')
        }
        if (command.action === 'open-external' && !before.external) {
          throw new Error('browser_failure_external_unavailable')
        }
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          return await new Promise<BrowserFailureState>((resolve, reject) => {
            pending.current = reject
            timer = setTimeout(
              () => reject(new Error('browser_failure_expired_effect_unknown')),
              Math.max(0, event.expiresAt - Date.now())
            )
            const perform = async (): Promise<void> => {
              if (command.action === 'copy-address') {
                await before.copy()
              } else if (command.action === 'open-external') {
                await before.external?.()
              } else {
                const result = await before.proceed()
                if (!result.ok) {
                  throw new Error(`browser_failure_certificate_refused:${result.reason}`)
                }
              }
            }
            void perform()
              .then(() => {
                if (Date.now() >= event.expiresAt || !matches(current.current)) {
                  reject(new Error('browser_failure_owner_changed_effect_unknown'))
                } else {
                  resolve({ ...command, accepted: true })
                }
              }, reject)
              .finally(() => {
                if (pending.current === reject) {
                  pending.current = null
                }
              })
          })
        } finally {
          clearTimeout(timer)
        }
      })
    }
    window.addEventListener('orca:browser-failure', receive)
    return () => {
      mounted = false
      window.removeEventListener('orca:browser-failure', receive)
      pending.current?.(new Error('browser_failure_unmounted_effect_unknown'))
      pending.current = null
    }
  }, [])
}
