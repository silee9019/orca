import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ClientHostedBrowserRow } from '../../../../shared/client-hosted-browser-rows'
import { ClientHostedBrowserRowEvent } from '../../runtime/client-hosted-browser-row-request'
import {
  getClientHostedBrowserRows,
  getClientHostedBrowserRowSelection,
  subscribeClientHostedBrowserRows
} from '@/lib/pane-manager/client-hosted-browser-row-state'
import { useAppStore } from '../../store'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'

type Owner = {
  rows: readonly ClientHostedBrowserRow[]
  worktreeId: string
  groupId: string
  groupActiveTabId: string | null
  activate: (page: string) => void
  close: (page: string) => Promise<void>
}
export function useClientHostedBrowserRowCommands(owner: Owner): void {
  const latest = useRef(owner)
  useLayoutEffect(() => {
    latest.current = owner
  })
  useEffect(() => {
    let disposed = false
    const active = new Set<AbortController>()
    const receive = (event: Event) => {
      if (!(event instanceof ClientHostedBrowserRowEvent)) {
        return
      }
      const before = latest.current
      const command = event.command
      if (
        before.worktreeId !== command.worktreeId ||
        before.groupId !== command.groupId ||
        !before.rows.some((row) => row.browserPageId === command.page)
      ) {
        return
      }
      event.offers.push(async () => {
        const controller = new AbortController()
        const checkScope = () => {
          const state = useAppStore.getState()
          const now = latest.current
          const group = state.groupsByWorktree[command.worktreeId]?.find(
            (group) => group.id === command.groupId
          )
          if (disposed || Date.now() >= event.expiresAt) {
            throw new Error('client_row_expired_or_disposed_effect_unknown')
          }
          if (
            now.worktreeId !== before.worktreeId ||
            now.groupId !== before.groupId ||
            now.groupActiveTabId !== before.groupActiveTabId ||
            state.activeWorktreeId !== command.worktreeId ||
            !group ||
            (group.activeTabId ?? null) !== before.groupActiveTabId
          ) {
            throw new Error('client_row_target_changed_effect_unknown')
          }
          if (!state.settings || !state.persistedUIReady || state.activeModal !== 'none') {
            throw new Error('client_row_busy')
          }
          if (getRuntimeEnvironmentIdForWorktree(state, command.worktreeId)) {
            throw new Error('client_row_host_unavailable')
          }
        }
        checkScope()
        const row = getClientHostedBrowserRows(command.worktreeId).find(
          (row) => row.browserPageId === command.page
        )
        if (
          !row ||
          row.worktreeId !== command.worktreeId ||
          row.browserHostClientId !== command.expectedHostClientId
        ) {
          throw new Error('client_row_host_changed')
        }
        if (active.size) {
          throw new Error('client_row_busy')
        }
        active.add(controller)
        let timer: ReturnType<typeof setTimeout> | undefined
        let unsubscribeRows = () => {}
        let unsubscribeState = () => {}
        let unsubscribeAbort = () => {}
        const completion = new Promise<void>((resolve, reject) => {
          const abort = () => reject(new Error('client_row_expired_or_disposed_effect_unknown'))
          controller.signal.addEventListener('abort', abort, { once: true })
          unsubscribeAbort = () => controller.signal.removeEventListener('abort', abort)
          const inspect = () => {
            try {
              checkScope()
              const current = getClientHostedBrowserRows(command.worktreeId).find(
                (row) => row.browserPageId === command.page
              )
              if (current && current.browserHostClientId !== command.expectedHostClientId) {
                throw new Error('client_row_host_changed_effect_unknown')
              }
              if (command.action === 'close' && !current) {
                resolve()
              }
              if (command.action === 'activate') {
                const selection = getClientHostedBrowserRowSelection()
                if (
                  current &&
                  selection?.browserPageId === command.page &&
                  selection.worktreeId === command.worktreeId &&
                  selection.groupId === command.groupId &&
                  selection.groupActiveTabIdAtSelection === before.groupActiveTabId &&
                  useAppStore.getState().activeGroupIdByWorktree[command.worktreeId] ===
                    command.groupId
                ) {
                  resolve()
                }
              }
            } catch (error) {
              reject(error)
            }
          }
          unsubscribeRows = subscribeClientHostedBrowserRows(inspect)
          unsubscribeState = useAppStore.subscribe(inspect)
          timer = setTimeout(abort, Math.max(0, event.expiresAt - Date.now()))
        })
        try {
          // Observe rejection while the existing provider is still pending.
          const checkBeforeEffect = () => {
            checkScope()
            const row = getClientHostedBrowserRows(command.worktreeId).find(
              (row) => row.browserPageId === command.page
            )
            if (!row || row.browserHostClientId !== command.expectedHostClientId) {
              throw new Error('client_row_host_changed')
            }
            if (
              !latest.current.rows.some(
                (row) =>
                  row.browserPageId === command.page &&
                  row.browserHostClientId === command.expectedHostClientId
              )
            ) {
              throw new Error('client_row_owner_changed')
            }
          }
          const effect =
            command.action === 'activate'
              ? Promise.resolve().then(() => {
                  checkBeforeEffect()
                  before.activate(command.page)
                })
              : Promise.resolve().then(() => {
                  checkBeforeEffect()
                  return before.close(command.page)
                })
          await Promise.all([effect, completion])
          checkScope()
          return { ...command, applied: true as const }
        } finally {
          clearTimeout(timer)
          unsubscribeRows()
          unsubscribeState()
          unsubscribeAbort()
          active.delete(controller)
        }
      })
    }
    window.addEventListener('orca:client-hosted-browser-row', receive)
    return () => {
      disposed = true
      window.removeEventListener('orca:client-hosted-browser-row', receive)
      for (const request of active) {
        request.abort()
      }
    }
  }, [owner.worktreeId, owner.groupId])
}
