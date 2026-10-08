import {
  hostPages,
  publishHostSnapshot
} from '@/runtime/web-runtime-browser-creation-placement-test-rig'
import { makeSnapshot, WT } from '@/runtime/web-session-tabs-sync-test-harness'
import { applyWebSessionTabsSnapshot } from '@/runtime/web-session-tabs-sync'
import { useEffect } from 'react'
import { registerContentCreationIpcBridge } from './content-creation-ipc-bridge'
import { vi } from 'vitest'
import { useAppStore } from '@/store'
import { seedBrowserServerReopenOwner } from '@/components/browser-pane/browser-server-reopen.test-fixture'
import { makeWorktree } from '@/store/slices/store-test-helpers'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import type { BrowserPairedNewTabTarget } from '../../../../shared/rpc-contract/browser-paired-new-tab-params'
export function seedBrowserPairedNewTabOwner(group = true): {
  target: BrowserPairedNewTabTarget
  started: Promise<void>
  call: ReturnType<typeof seedBrowserServerReopenOwner>['call']
} {
  const { command, call } = seedBrowserServerReopenOwner()
  useAppStore.setState({
    worktreesByRepo: {
      repo: [
        makeWorktree({ id: command.worktreeId, repoId: 'repo', hostId: command.executionHostId })
      ]
    },
    ...(!group
      ? {
          groupsByWorktree: { [command.worktreeId]: [] },
          activeGroupIdByWorktree: {},
          unifiedTabsByWorktree: {},
          layoutByWorktree: {}
        }
      : {})
  })
  replaceRuntimeEnvironmentRevisions([
    { id: command.environmentId, createdAt: 1, pairingRevision: 7 }
  ])
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ...window.api,
      ui: { onNewBrowserTab: vi.fn(() => () => {}), onNewMarkdownTab: vi.fn(() => () => {}) }
    }
  })
  const implementation = call.getMockImplementation()
  if (typeof implementation !== 'function') {
    throw new Error('missing provider')
  }
  let signal = () => {}
  const started = new Promise<void>((resolve) => {
    signal = resolve
  })
  call.mockImplementation((request) => {
    const response = Reflect.apply(implementation, undefined, [request])
    if (request.method === 'browser.tabCreate') {
      signal()
    }
    return response
  })
  return {
    call,
    started,
    target: {
      worktree: command.worktreeId,
      ...(group ? { group: command.groupId } : {}),
      environmentId: command.environmentId,
      executionHostId: command.executionHostId,
      pairingRevision: 7
    }
  }
}

export function BrowserPairedNewTabSourceSurface() {
  useEffect(() => {
    const unsubs: (() => void)[] = []
    registerContentCreationIpcBridge(unsubs, () => true)
    return () => unsubs.forEach((dispose) => dispose())
  }, [])
  return null
}

export function publishBrowserPairedNewTabSnapshot(environmentId: string, worktree: string): void {
  if (worktree === WT) {
    publishHostSnapshot()
    return
  }
  const snapshot = makeSnapshot(
    hostPages.map((id) => ({
      type: 'browser' as const,
      id: `host-tab-${id}`,
      title: 'New Browser Tab',
      browserWorkspaceId: `host-workspace-${id}`,
      browserPageId: id,
      url: 'about:blank',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      isActive: false
    })),
    { worktree, snapshotVersion: 100, activeTabType: 'browser', activeTabId: null }
  )
  useAppStore.setState((state) =>
    applyWebSessionTabsSnapshot(state, snapshot, environmentId, Date.now())
  )
}
