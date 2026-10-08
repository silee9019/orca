import { resolveWorktreeOperationRoute } from '@/lib/worktree-operation-route'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { observeLinkedBrowserCreation } from '@/runtime/linked-browser-readback'
import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { LINKED_BROWSER_EVENT } from '@/runtime/linked-browser-request'
import { LinkedBrowserCommand } from '../../../../shared/rpc-contract/linked-browser-params'
import type { WorktreeCardIssueDisplay } from './worktree-card-meta-types'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'

type Options = {
  workspaceId?: string
  surface?: LinkedBrowserCommand['surface']
  open: boolean
  issue: WorktreeCardIssueDisplay | null
  review: WorktreeCardPrDisplay | null
  closeHover: () => void
  openIssue?: (url: string) => void | Promise<boolean>
  openReview?: (url: string) => void | Promise<boolean>
}
export function useLinkedBrowserRequest(options: Options): void {
  const current = useRef(options)
  const closing = useRef(false)
  if (
    !options.open ||
    options.workspaceId !== current.current.workspaceId ||
    options.surface !== current.current.surface
  ) {
    closing.current = false
  }
  current.current = options
  useEffect(() => {
    const pending = new Set<() => void>()
    const receive = (event: WindowEventMap[typeof LINKED_BROWSER_EVENT]): void => {
      const request = event.detail
      const owner = current.current
      if (
        request.command.workspaceId !== owner.workspaceId ||
        request.command.surface !== owner.surface ||
        !owner.open ||
        !request.claim()
      ) {
        return
      }
      try {
        const command = LinkedBrowserCommand.parse(request.command)
        const state = useAppStore.getState()
        const item = command.kind === 'issue' ? owner.issue : owner.review
        const open = command.kind === 'issue' ? owner.openIssue : owner.openReview
        const target = new URL(command.url)
        const route = resolveWorktreeOperationRoute(state, command.workspaceId)
        const availability = getClientCreationActionPolicy(state, command.workspaceId)[
          'managed-browser'
        ]
        if (
          Date.now() >= request.expiresAt ||
          pending.size > 0 ||
          closing.current ||
          state.activeModal !== 'none' ||
          !route ||
          route.executionHostId !== command.executionHostId ||
          route.runtimeEnvironmentId !== (command.runtimeEnvironmentId ?? null) ||
          availability.state !== 'enabled' ||
          !open ||
          !item ||
          item.number !== command.number ||
          item.url !== command.url ||
          !['http:', 'https:'].includes(target.protocol)
        ) {
          throw new Error('linked_browser_target_mismatch')
        }
        let cancel: (() => void) | undefined
        closing.current = true
        const observation = observeLinkedBrowserCreation(
          command,
          request.expiresAt,
          availability.provider === 'paired-runtime' ? route.runtimeEnvironmentId : null,
          () => {
            owner.closeHover()
            return open(command.url)
          },
          (error, result) => {
            if (cancel) {
              pending.delete(cancel)
            }
            request.finish(error, result)
          }
        )
        cancel = observation.cancel
        if (!observation.settled) {
          pending.add(observation.cancel)
        }
      } catch {
        request.finish(new Error('linked_browser_action_failed_effect_unknown'))
      }
    }
    window.addEventListener(LINKED_BROWSER_EVENT, receive)
    return () => {
      window.removeEventListener(LINKED_BROWSER_EVENT, receive)
      // Closing an activity hover unmounts its receiver while the initiated browser service still owns completion.
      if (!closing.current) {
        for (const cancel of pending) {
          cancel()
        }
      }
      pending.clear()
    }
  }, [])
}
