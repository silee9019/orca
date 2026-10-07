import { useEffect, useLayoutEffect, useRef } from 'react'
import { BROWSER_COPY_SHORTCUT_COMMAND_EVENT } from '@/runtime/browser-copy-shortcut-request'
import { requestBrowserGrab } from '@/runtime/browser-grab-request'
import { BrowserGrabCopyPriority } from '../../../../../shared/browser-grab-copy-priority'
import type { BrowserChromeShortcutScope } from '../describe-page/browser-page-types'
import { browserGrabShortcutOwnsTarget } from './browser-grab-shortcut-priority'
export function useBrowserCopyShortcutCommands(
  page: string,
  workspace: string,
  active: boolean,
  scope: BrowserChromeShortcutScope,
  markup: boolean
): void {
  const current = useRef({ page, workspace, active, scope, markup })
  const mounted = useRef(false)
  const busy = useRef(false)
  useLayoutEffect(() => {
    current.current = { page, workspace, active, scope, markup }
  })
  useEffect(() => {
    mounted.current = true
    const receive = (event: WindowEventMap['orca:browser-copy-shortcut-command']): void => {
      const request = event.detail
      if (request.page !== page) {
        return
      }
      request.offer(active && scope !== 'inactive', () => {
        void execute()
      })
      async function execute(): Promise<void> {
        if (busy.current) {
          request.finish(new Error('browser_copy_shortcut_busy'))
          return
        }
        busy.current = true
        const target = document.activeElement
        const owner = current.current
        const validate = (): void => {
          if (
            !mounted.current ||
            current.current !== owner ||
            !owner.active ||
            request.isSettled() ||
            Date.now() >= request.expiresAt ||
            document.activeElement !== target
          ) {
            throw new Error('browser_copy_shortcut_owner_changed')
          }
          if (
            !browserGrabShortcutOwnsTarget(
              owner.scope,
              target,
              owner.workspace,
              'copy',
              owner.markup
            )
          ) {
            throw new Error('browser_copy_shortcut_native_copy_priority')
          }
        }
        try {
          validate()
          const probe = window.api.browser.getGrabCopyShortcutPriority
          if (!probe) {
            throw new Error('browser_copy_shortcut_priority_unavailable')
          }
          const priority = BrowserGrabCopyPriority.parse(await probe({ browserPageId: page }))
          validate()
          if (!priority.allowed) {
            throw new Error('browser_copy_shortcut_native_copy_priority')
          }
          const state = await requestBrowserGrab(page, 'toggle', request.expiresAt, 'copy')
          request.finish(undefined, state)
        } catch (error) {
          request.finish(error instanceof Error ? error : new Error('browser_copy_shortcut_failed'))
        } finally {
          busy.current = false
        }
      }
    }
    window.addEventListener(BROWSER_COPY_SHORTCUT_COMMAND_EVENT, receive)
    return () => {
      mounted.current = false
      window.removeEventListener(BROWSER_COPY_SHORTCUT_COMMAND_EVENT, receive)
    }
  }, [page, active, scope])
}
