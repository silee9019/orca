// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestRemoteBrowserPane } from '@/runtime/browser-remote-pane-request'
import { useRemoteBrowserPaneCommands } from './use-remote-browser-pane-commands'
import { useRemoteBrowserPageStream } from './use-remote-browser-page-stream'
import { createHarness } from './remote-browser-stream-lifecycle-test-harness'
import type { RemoteBrowserStreamStatus } from './remote-browser-stream-status'
vi.mock('@/runtime/runtime-rpc-client', async () => ({
  callRuntimeRpc: vi.fn(async () => ({})),
  RuntimeRpcCallError: (await import('@/runtime/runtime-rpc-result')).RuntimeRpcCallError
}))
vi.mock('@/hooks/use-window-stream-visibility', () => ({ useWindowStreamVisible: () => true }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('reconnects through the mounted stream owner and closes its prior subscription', async () => {
  const harness = createHarness()
  const clearPendingRemoteWheel = vi.fn()
  function Owner() {
    const viewport = useRef<HTMLDivElement>(null)
    const [, renderStatus] = useState<RemoteBrowserStreamStatus>({
      kind: 'stopped',
      notice: 'lost'
    })
    const stream = useRemoteBrowserPageStream({
      activeRuntimeEnvironmentId: 'env-1',
      browserPageId: 'tab-1',
      isActive: true,
      lifecycle: harness.lifecycle,
      stagedPage: false,
      runtimeWorktree: 'worktree:wt-1',
      runtimeTarget: () => ({ kind: 'environment', environmentId: 'env-1' }),
      remoteViewportRef: viewport,
      remoteViewportSizeRef: useRef(null),
      remoteCssViewportSizeRef: useRef(null),
      remoteViewportTimerRef: useRef(null),
      streamFrameUrlRef: useRef(null),
      pendingFrameDecodeRef: useRef(0),
      streamBridgeRef: useRef({
        applyTabInfo: () => {},
        clearFrame: () => {},
        handleFrameBytes: () => {},
        closeMissingRemotePage: () => {},
        waitForViewportSize: async () => null,
        syncViewport: async () => {}
      }),
      isActiveRef: useRef(true),
      applyTabInfo: () => {},
      clearStreamFrame: () => {},
      closeMissingRemotePage: () => {},
      clearPendingRemoteWheel,
      setPaneNotice: () => {},
      setPaneBusy: () => {},
      setFrameUrl: () => {},
      setFrameMetadata: () => {}
    })
    useRemoteBrowserPaneCommands({
      page: 'tab-1',
      environmentId: 'env-1',
      active: true,
      staged: false,
      remotePageId: harness.lifecycle.tokens.remotePage,
      streamStatus: { kind: 'stopped', notice: 'lost' },
      reconnectGeneration: stream.reconnectGeneration,
      reconnect: stream.reconnectRemoteStream
    })
    return <div ref={viewport} onClick={() => renderStatus({ kind: 'live' })} />
  }
  const owner = render(<Owner />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(harness.streams).toHaveLength(1)
  await act(async () => {
    harness.streams[0].emitReady()
    owner.rerender(<Owner />)
  })
  let result
  await act(async () => {
    result = requestRemoteBrowserPane(
      'tab-1',
      { environmentId: 'env-1', expectedRemotePageId: 'page-1', action: 'reconnect' },
      Date.now() + 1000
    )
    await Promise.resolve()
  })
  await expect(result).resolves.toMatchObject({ reconnectRequested: true, streamConnected: false })
  expect(harness.streams[0].unsubscribeCount).toBe(1)
  expect(harness.streams).toHaveLength(2)
  owner.unmount()
  expect(harness.streams[1].unsubscribeCount).toBe(1)
})
it('refuses unavailable and mismatched owners without claiming success', async () => {
  await expect(
    requestRemoteBrowserPane(
      'absent',
      { environmentId: 'env-1', expectedRemotePageId: null, action: 'status' },
      Date.now() + 100
    )
  ).rejects.toThrow('remote_browser_pane_unavailable')
})

it.each([
  ['environment', { environmentId: 'other' }, 'remote_browser_pane_target_mismatch'],
  ['page incarnation', { remotePageId: 'other' }, 'remote_browser_pane_target_mismatch'],
  ['inactive', { active: false }, 'remote_browser_pane_inactive_or_staged'],
  ['staged', { staged: true }, 'remote_browser_pane_inactive_or_staged'],
  ['live', { streamStatus: { kind: 'live' as const } }, 'remote_browser_reconnect_unavailable']
])('refuses %s before invoking reconnect', async (_name, override, message) => {
  const reconnect = vi.fn()
  function Owner() {
    useRemoteBrowserPaneCommands({
      page: 'tab-1',
      environmentId: 'env-1',
      remotePageId: 'page-1',
      active: true,
      staged: false,
      streamStatus: { kind: 'stopped', notice: 'lost' },
      reconnectGeneration: 0,
      reconnect,
      ...override
    })
    return null
  }
  render(<Owner />)
  await expect(
    requestRemoteBrowserPane(
      'tab-1',
      { environmentId: 'env-1', expectedRemotePageId: 'page-1', action: 'reconnect' },
      Date.now() + 100
    )
  ).rejects.toThrow(message)
  expect(reconnect).not.toHaveBeenCalled()
})
it('does not turn an expired or uncommitted reconnect into success', async () => {
  const reconnect = vi.fn()
  function Owner() {
    useRemoteBrowserPaneCommands({
      page: 'tab-1',
      environmentId: 'env-1',
      remotePageId: null,
      active: true,
      staged: false,
      streamStatus: { kind: 'stopped', notice: 'lost' },
      reconnectGeneration: 0,
      reconnect
    })
    return null
  }
  const view = render(<Owner />)
  const command = {
    environmentId: 'env-1',
    expectedRemotePageId: null,
    action: 'reconnect' as const
  }
  await expect(requestRemoteBrowserPane('tab-1', command, Date.now() - 1)).rejects.toThrow(
    'request_expired'
  )
  expect(reconnect).not.toHaveBeenCalled()
  const pending = requestRemoteBrowserPane('tab-1', command, Date.now() + 1000)
  const rejected = expect(pending).rejects.toThrow('remote_browser_pane_unmounted_effect_unknown')
  view.unmount()
  await rejected
  expect(reconnect).toHaveBeenCalledTimes(1)
})
