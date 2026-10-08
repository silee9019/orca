import { vi } from 'vitest'
import type { BrowserServerReopenCommand } from '../../../../shared/rpc-contract/browser-server-reopen-params'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../shared/constants'
import { ReopenBrowserPageOnServerButton } from './ReopenBrowserPageOnServerButton'
import {
  ENV,
  WT,
  resetWebSessionTabsSyncTestState
} from '@/runtime/web-session-tabs-sync-test-harness'
import {
  G1,
  HOST,
  SOURCE,
  installRuntimeTransport,
  resetHostPages,
  seedPairedWorktree
} from '@/runtime/web-runtime-browser-creation-placement-test-rig'
export const placement = {
  kind: 'client',
  browserHostClientId: 'fixture-client',
  browserHostGeneration: 3,
  pageHostGeneration: 7
} as const
export function seedBrowserServerReopenOwner(): {
  call: ReturnType<typeof installRuntimeTransport>
  command: BrowserServerReopenCommand
} {
  resetWebSessionTabsSyncTestState()
  resetHostPages()
  seedPairedWorktree()
  const call = installRuntimeTransport()
  const api = window.api
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'api', { configurable: true, value: api })
  useAppStore.setState({
    settings: { ...getDefaultSettings('/fixture'), activeRuntimeEnvironmentId: ENV },
    persistedUIReady: true,
    recordFeatureInteraction: vi.fn(async () => {}),
    activeModal: 'none',
    activeView: 'terminal',
    activeGroupIdByWorktree: { [WT]: G1 },
    activeBrowserTabId: SOURCE.workspaceId,
    activeBrowserTabIdByWorktree: { [WT]: SOURCE.workspaceId },
    remoteBrowserPageHandlesByPageId: {
      ...useAppStore.getState().remoteBrowserPageHandlesByPageId,
      [SOURCE.pageId]: { environmentId: ENV, remotePageId: SOURCE.pageId, placement }
    }
  })
  return {
    call,
    command: {
      page: SOURCE.pageId,
      worktreeId: WT,
      workspaceId: SOURCE.workspaceId,
      groupId: G1,
      executionHostId: HOST,
      environmentId: ENV,
      clientTarget: {
        remotePageId: SOURCE.pageId,
        browserHostClientId: placement.browserHostClientId,
        browserHostGeneration: placement.browserHostGeneration,
        pageHostGeneration: placement.pageHostGeneration
      }
    }
  }
}
export function BrowserServerReopenSourceSurface() {
  const visible = useAppStore(
    (state) =>
      state.groupsByWorktree[WT]?.find((group) => group.id === G1)?.activeTabId ===
      SOURCE.unifiedTabId
  )
  return visible ? (
    <ReopenBrowserPageOnServerButton
      commandOwner={{ page: SOURCE.pageId, active: true, clientPlacement: placement }}
      environmentId={ENV}
      worktreeId={WT}
      lastCommittedUrl="https://example.com/"
    />
  ) : null
}
