import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { requireHostViewer } from '@/runtime/voice-viewer-target'
import { requireBrowserSetupGuide } from '@/runtime/browser-setup-guide-actions'
import { BROWSER_SETUP_GUIDE_EVENT } from '@/runtime/browser-setup-guide-request'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '@/lib/browser-use-setup-state'
import { ORCHESTRATION_ENABLED_STORAGE_KEY } from '@/lib/orchestration-setup-state'
type BrowserSetupGuideBrowserOwner = {
  done: boolean
  creationEnabled: boolean
  targetWorkspaceId: string | null
  perform: () => Promise<boolean>
}
export function useBrowserSetupGuideBrowserOwner(owner: BrowserSetupGuideBrowserOwner): void {
  const current = useRef(owner)
  current.current = owner
  const busy = useRef(false)
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof BROWSER_SETUP_GUIDE_EVENT]): void => {
      const request = event.detail
      const command = request.command
      if (command.action !== 'try-it') {
        return
      }
      request.offer(() => {
        let started = false
        try {
          requireBrowserSetupGuide(command)
          if (Date.now() >= request.expiresAt || request.isSettled()) {
            throw new Error('browser_setup_guide_request_expired')
          }
          const initial = current.current
          const state = useAppStore.getState()
          if (busy.current || initial.done || !initial.creationEnabled) {
            throw new Error('browser_setup_guide_try_unavailable')
          }
          if (initial.targetWorkspaceId !== command.targetWorkspaceId) {
            throw new Error('browser_setup_guide_target_mismatch')
          }
          const target = command.targetWorkspaceId
          const policy = getClientCreationActionPolicy(state, target)['managed-browser']
          if (policy.state !== 'enabled' || policy.provider !== 'local-client') {
            throw new Error('browser_setup_guide_provider_unavailable')
          }
          const group = target
            ? (state.activeGroupIdByWorktree[target] ?? state.groupsByWorktree[target]?.[0]?.id)
            : null
          if (group !== command.groupId || (target && !group)) {
            throw new Error('browser_setup_guide_group_mismatch')
          }
          const before = new Set(
            (target ? (state.browserTabsByWorktree[target] ?? []) : []).map((tab) => tab.id)
          )
          const expectedUrl = state.browserDefaultUrl ?? 'about:blank'
          busy.current = true
          started = true
          void initial
            .perform()
            .then((accepted) => {
              if (!accepted) {
                throw new Error('browser_setup_guide_callback_unacknowledged')
              }
              if (request.isSettled()) {
                return
              }
              const result = requireHostViewer()
              if (Date.now() >= request.expiresAt) {
                throw new Error('browser_setup_guide_request_expired')
              }
              if (target === null) {
                if (result.activeModal !== 'add-repo') {
                  throw new Error('browser_setup_guide_prompt_unacknowledged')
                }
              } else {
                const created = (result.browserTabsByWorktree[target] ?? []).filter(
                  (tab) => !before.has(tab.id)
                )
                const tab = created.length === 1 ? created[0] : undefined
                const unified = (result.unifiedTabsByWorktree[target] ?? []).find(
                  (item) => item.contentType === 'browser' && item.entityId === tab?.id
                )
                const pages = tab ? (result.browserPagesByWorkspace[tab.id] ?? []) : []
                if (
                  result.activeModal !== 'none' ||
                  result.activeView !== 'terminal' ||
                  result.activeWorktreeId !== target ||
                  !tab ||
                  unified?.groupId !== group ||
                  result.activeBrowserTabId !== tab.id ||
                  pages.length !== 1 ||
                  pages[0].url !== expectedUrl ||
                  !result.pendingAddressBarFocusByPageId[pages[0].id]
                ) {
                  throw new Error('browser_setup_guide_browser_unacknowledged')
                }
              }
              request.finish(undefined, {
                projectPrompted: target === null,
                browserOpened: target !== null,
                busy: false,
                browserUseEnabled: localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY) === '1',
                orchestrationEnabled:
                  localStorage.getItem(ORCHESTRATION_ENABLED_STORAGE_KEY) === '1',
                interactionRecorded:
                  (result.featureInteractions['agent-browser-setup']?.interactionCount ?? 0) > 0
              })
            })
            .catch(() => request.finish(new Error('browser_setup_guide_effect_unknown')))
            .finally(() => {
              busy.current = false
            })
        } catch (error) {
          if (started) {
            busy.current = false
            request.finish(new Error('browser_setup_guide_effect_unknown'))
            return
          }
          request.finish(
            error instanceof Error ? error : new Error('browser_setup_guide_try_failed')
          )
        }
      })
    }
    window.addEventListener(BROWSER_SETUP_GUIDE_EVENT, receive)
    return () => window.removeEventListener(BROWSER_SETUP_GUIDE_EVENT, receive)
  }, [])
}
