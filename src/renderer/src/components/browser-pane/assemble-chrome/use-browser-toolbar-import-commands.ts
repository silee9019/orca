import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import type { BrowserCookieImportExecutionResult } from '@/store/slices/browser'
import type { BrowserProfileUiState } from '../../../../../shared/rpc-contract/browser-profile-ui-params'
import {
  BROWSER_PROFILE_UI_COMMAND_EVENT,
  type BrowserProfileUiEvent
} from '@/runtime/browser-profile-ui-request'
import { requireBrowserImportHintIdentity } from '@/runtime/browser-import-hint-actions'
import { waitForView } from '@/runtime/voice-viewer-target'
import { completeBrowserImportHintCookie } from '@/runtime/browser-import-hint-cookie-receipt'

type ToolbarImportOwner = {
  page: string
  active: boolean
  snapshot: BrowserProfileUiState
  cookieHost: string
  cookieMenuForcedOpen?: boolean
  cookieBusy: boolean
  menu: (open: boolean) => void
  importBrowser: (family: string, profile?: string) => Promise<BrowserCookieImportExecutionResult>
  importFile: (filePath: string) => Promise<BrowserCookieImportExecutionResult>
}
export function useBrowserToolbarImportCommands(owner: ToolbarImportOwner): void {
  const current = useRef(owner)
  const pending = useRef<BrowserProfileUiEvent | null>(null)
  const generation = useRef(0)
  useLayoutEffect(() => {
    const previous = current.current
    if (
      previous.page !== owner.page ||
      previous.active !== owner.active ||
      previous.cookieHost !== owner.cookieHost ||
      previous.snapshot.workspace !== owner.snapshot.workspace ||
      previous.snapshot.profile !== owner.snapshot.profile ||
      previous.snapshot.partition !== owner.snapshot.partition
    ) {
      generation.current += 1
    }
    current.current = owner
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-profile-ui-command']): void => {
      const request = event.detail
      const command = request.command
      if (
        request.page !== owner.page ||
        (command.action !== 'import-file' && command.action !== 'import-browser')
      ) {
        return
      }
      request.offer(() => {
        const before = current.current
        const revision = generation.current
        const identity = {
          action: command.action,
          hostId: 'local',
          pageId: request.page,
          profileId: command.profile ?? before.snapshot.profile,
          confirmProfile: command.profile ?? before.snapshot.profile
        }
        const requireCurrent = (): void => {
          const state = useAppStore.getState()
          requireBrowserImportHintIdentity(identity)
          const workspace = Object.values(state.browserTabsByWorktree)
            .flat()
            .find((tab) => tab.id === before.snapshot.workspace)
          if (!workspace || (workspace.sessionPartition ?? null) !== before.snapshot.partition) {
            throw new Error('browser_toolbar_import_partition_changed_effect_unknown')
          }
          if (
            request.isSettled() ||
            Date.now() >= request.expiresAt ||
            generation.current !== revision ||
            !current.current.active ||
            current.current.cookieHost !== 'local' ||
            state.activeModal !== 'none' ||
            state.activeView !== 'terminal'
          ) {
            throw new Error('browser_toolbar_import_owner_changed_effect_unknown')
          }
        }
        try {
          requireCurrent()
          if (pending.current || before.cookieBusy || before.snapshot.creating) {
            throw new Error('browser_toolbar_import_busy')
          }
        } catch {
          request.finish(new Error('browser_toolbar_import_unavailable'))
          return
        }
        pending.current = request
        const unsubscribe = useAppStore.subscribe(() => {
          try {
            requireCurrent()
          } catch {
            request.finish(new Error('browser_toolbar_import_owner_changed_effect_unknown'))
          }
        })
        const expiryTimer = window.setTimeout(
          unsubscribe,
          Math.max(0, request.expiresAt - Date.now())
        )
        const work = completeBrowserImportHintCookie(
          identity,
          async () => {
            const result =
              command.action === 'import-file'
                ? before.importFile(command.filePath)
                : before.importBrowser(command.family, command.browserProfile)
            before.menu(false)
            return result
          },
          true
        )
        void work
          .then(async (imported) => {
            requireCurrent()
            if (
              !(await waitForView(
                () => current.current.snapshot.menuOpen === (before.cookieMenuForcedOpen ?? false),
                request.expiresAt
              ))
            ) {
              throw new Error('browser_toolbar_import_menu_readback_failed')
            }
            requireCurrent()
            const result = {
              ...current.current.snapshot,
              cookieImport: {
                profile: identity.profileId,
                imported: imported.importedCookies,
                skipped: imported.skippedCookies,
                total: imported.totalCookies,
                executionHost: 'local' as const,
                executionMachine: 'client' as const
              }
            }
            request.finish(undefined, result)
          })
          .catch(() => {
            request.finish(new Error('browser_toolbar_import_failed_effect_unknown'))
          })
          .finally(() => {
            unsubscribe()
            window.clearTimeout(expiryTimer)
            if (pending.current === request) {
              pending.current = null
            }
          })
      })
    }
    window.addEventListener(BROWSER_PROFILE_UI_COMMAND_EVENT, receive)
    return () => {
      window.removeEventListener(BROWSER_PROFILE_UI_COMMAND_EVENT, receive)
      generation.current += 1
      pending.current?.finish(new Error('browser_toolbar_import_owner_unmounted_effect_unknown'))
    }
  }, [owner.page])
}
