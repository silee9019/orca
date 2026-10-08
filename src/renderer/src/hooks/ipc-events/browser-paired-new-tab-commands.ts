import { useAppStore } from '@/store'
import { BrowserPairedNewTabEvent } from '@/runtime/browser-paired-new-tab-request'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { getResolvedExecutionHostIdForWorktree } from '@/lib/resolved-worktree-execution-host'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import { loadPairedBrowserTabCreator } from '@/store/slices/browser/paired-browser-tab-creator'
import {
  createBrowserTabForCurrentViewer,
  resolveBrowserNewTabInvocation
} from './browser-new-tab-owner'
import type { BrowserPairedNewTabState } from '../../../../shared/rpc-contract/browser-paired-new-tab-params'
export function registerBrowserPairedNewTabCommands(): () => void {
  let disposed = false
  let pending: { finish: (error: Error) => void; handedOff: boolean } | undefined
  let generation = 0
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (
      state.activeWorktreeId !== previous.activeWorktreeId ||
      state.activeWorkspaceExecutionHostId !== previous.activeWorkspaceExecutionHostId ||
      state.activeGroupIdByWorktree !== previous.activeGroupIdByWorktree ||
      state.groupsByWorktree !== previous.groupsByWorktree ||
      state.settings !== previous.settings ||
      state.activeModal !== previous.activeModal ||
      state.activeView !== previous.activeView ||
      state.worktreesByRepo !== previous.worktreesByRepo ||
      state.repos !== previous.repos ||
      state.folderWorkspaces !== previous.folderWorkspaces ||
      state.projectGroups !== previous.projectGroups ||
      state.persistedUIReady !== previous.persistedUIReady
    ) {
      generation += 1
    }
  })
  const receive = (raw: Event) => {
    if (!(raw instanceof BrowserPairedNewTabEvent)) {
      return
    }
    const before = useAppStore.getState()
    const invocation = resolveBrowserNewTabInvocation(before)
    const target = raw.command
    const offeredGeneration = generation
    raw.offers.push(async () => {
      if (pending) {
        throw new Error('browser_paired_new_tab_busy')
      }
      const check = () => {
        const current = useAppStore.getState()
        const now = resolveBrowserNewTabInvocation(current)
        const policy = getClientCreationActionPolicy(current, target.worktree)['managed-browser']
        if (
          disposed ||
          generation !== offeredGeneration ||
          Date.now() >= raw.expiresAt ||
          invocation.floating ||
          now.floating ||
          now.worktree !== target.worktree ||
          now.group !== target.group ||
          invocation.worktree !== target.worktree ||
          invocation.group !== target.group ||
          current.activeModal !== 'none' ||
          !current.persistedUIReady ||
          current.activeView !== 'terminal' ||
          policy.state !== 'enabled' ||
          policy.provider !== 'paired-runtime' ||
          getResolvedExecutionHostIdForWorktree(current, target.worktree) !==
            target.executionHostId ||
          target.executionHostId !== `runtime:${target.environmentId}` ||
          getRuntimeEnvironmentIdForWorktree(current, target.worktree) !== target.environmentId ||
          getRuntimeEnvironmentRevision(target.environmentId) !== target.pairingRevision
        ) {
          throw new Error('browser_paired_new_tab_target_changed')
        }
      }
      check()
      return new Promise<BrowserPairedNewTabState>((resolve, reject) => {
        const finish = (error?: Error, receipt?: BrowserPairedNewTabState) => {
          if (pending !== operation) {
            return
          }
          pending = undefined
          clearTimeout(timer)
          const failure =
            error ??
            (receipt && Date.now() >= raw.expiresAt
              ? new Error('browser_paired_new_tab_expired_effect_unknown')
              : undefined)
          if (failure) {
            reject(failure)
          } else if (receipt) {
            resolve(receipt)
          } else {
            reject(new Error('browser_paired_new_tab_effect_unknown'))
          }
        }
        const operation = { handedOff: false, finish }
        pending = operation
        const timer = setTimeout(
          () => finish(new Error('browser_paired_new_tab_expired_effect_unknown')),
          Math.max(0, raw.expiresAt - Date.now())
        )
        void (async () => {
          // Cold module loading finishes before revalidating the actual creation owner.
          await loadPairedBrowserTabCreator()
          check()
          let receipt: BrowserPairedNewTabState | undefined
          await createBrowserTabForCurrentViewer({
            workspaceFallback: true,
            onCreationReceipt: (message) => {
              if (pending !== operation) {
                return
              }
              if (message.phase === 'started') {
                operation.handedOff = true
                return
              }
              if (
                message.phase !== 'materialized' ||
                !operation.handedOff ||
                message.environmentId !== target.environmentId ||
                message.worktreeId !== target.worktree ||
                getRuntimeEnvironmentRevision(target.environmentId) !== target.pairingRevision
              ) {
                finish(new Error('browser_paired_new_tab_creation_changed_effect_unknown'))
                return
              }
              const state = useAppStore.getState()
              const pages = Object.values(state.browserPagesByWorkspace)
                .flat()
                .filter(
                  (page) =>
                    page.worktreeId === target.worktree &&
                    state.remoteBrowserPageHandlesByPageId[page.id]?.remotePageId ===
                      message.remotePageId &&
                    state.remoteBrowserPageHandlesByPageId[page.id]?.environmentId ===
                      target.environmentId &&
                    !state.remoteBrowserPageHandlesByPageId[page.id]?.staged
                )
              const page = pages.length === 1 ? pages[0] : undefined
              const tabs = page
                ? state.unifiedTabsByWorktree[target.worktree]?.filter(
                    (tab) =>
                      tab.contentType === 'browser' &&
                      tab.entityId === page.workspaceId &&
                      tab.executionHostId === target.executionHostId &&
                      (!target.group || tab.groupId === target.group)
                  )
                : undefined
              const tab = tabs?.length === 1 ? tabs[0] : undefined
              if (!page || !tab) {
                finish(new Error('browser_paired_new_tab_materialization_unknown'))
                return
              }
              receipt = {
                target,
                workspace: page.workspaceId,
                page: page.id,
                unifiedTab: tab.id,
                remotePageId: message.remotePageId,
                materialized: true,
                guestRegistrationVerified: false
              }
            }
          })
          finish(undefined, receipt)
        })().catch(() => finish(new Error('browser_paired_new_tab_failed_effect_unknown')))
      })
    })
  }
  window.addEventListener('orca:browser-paired-new-tab', receive)
  return () => {
    disposed = true
    unsubscribe()
    window.removeEventListener('orca:browser-paired-new-tab', receive)
    if (pending && !pending.handedOff) {
      pending.finish(new Error('browser_paired_new_tab_disposed'))
    }
  }
}
