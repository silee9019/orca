// @vitest-environment happy-dom
import { useRemoteBrowserPageInputQueue } from './use-remote-browser-input-queue'
import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { requestRemoteBrowserPane } from '@/runtime/browser-remote-pane-request'
import { useRemoteBrowserPaneCommands } from './use-remote-browser-pane-commands'
import { useRemoteBrowserPageInput } from './use-remote-browser-page-input'
import { createHarness } from './remote-browser-stream-lifecycle-test-harness'
vi.mock('@/runtime/runtime-rpc-client', async () => ({
  callRuntimeRpc: vi.fn(async () => ({})),
  RuntimeRpcCallError: (await import('@/runtime/runtime-rpc-result')).RuntimeRpcCallError
}))
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})
function mountOwner(afterCall?: (method: string) => Promise<void>) {
  const harness = createHarness()
  harness.lifecycle.tokens.setRemotePage('page-1')
  const provider: { held: boolean; keys: string[]; moves: unknown[] } = {
    held: false,
    keys: [],
    moves: []
  }
  const refresh = vi.fn()
  vi.mocked(callRuntimeRpc).mockImplementation(async (_target, method, params) => {
    if (method === 'browser.mouseMove') {
      provider.moves.push(params)
    }
    if (method === 'browser.mouseDown') {
      provider.held = true
    }
    if (method === 'browser.mouseUp') {
      provider.held = false
    }
    if (
      method === 'browser.keypress' &&
      typeof params === 'object' &&
      params &&
      'key' in params &&
      typeof params.key === 'string'
    ) {
      provider.keys.push(params.key)
    }
    await afterCall?.(method)
    return {}
  })
  function Owner() {
    const image = useRef<HTMLImageElement>(null)
    const viewport = useRef<HTMLDivElement>(null)
    const queue = useRemoteBrowserPageInputQueue()
    const input = useRemoteBrowserPageInput({
      busy: false,
      imageRef: image,
      remoteViewportRef: viewport,
      remoteCssViewportSizeRef: useRef({ width: 800, height: 600 }),
      remoteViewportSizeRef: useRef(null),
      frameMetadata: null,
      runtimeTarget: () => ({ kind: 'environment', environmentId: 'env-1' }),
      lifecycle: harness.lifecycle,
      runtimeWorktree: 'folder:fixture',
      enqueueRemoteInput: queue.enqueueRemoteInput,
      createRemoteOperationToken: (id) => harness.lifecycle.tokens.createOperationToken(id),
      isCurrentRemoteOperationToken: (token) => harness.lifecycle.tokens.isCurrent(token),
      closeMissingRemotePage: () => {},
      scheduleRemoteTabInfoRefresh: refresh,
      setPaneNotice: () => {}
    })
    useRemoteBrowserPaneCommands({
      page: 'tab-1',
      environmentId: 'env-1',
      remotePageId: 'page-1',
      active: true,
      staged: false,
      streamStatus: { kind: 'live' },
      reconnectGeneration: 0,
      reconnect: () => {},
      performInput: input.performRemoteInput
    })
    return (
      <div ref={viewport} data-testid="viewport">
        <img ref={image} tabIndex={0} alt="remote" />
      </div>
    )
  }
  const view = render(<Owner />)
  vi.spyOn(view.getByTestId('viewport'), 'getBoundingClientRect').mockReturnValue(
    new DOMRect(20, 30, 400, 300)
  )
  const command = (operation: object, expiresAt = Date.now() + 1000) =>
    requestRemoteBrowserPane(
      'tab-1',
      {
        environmentId: 'env-1',
        expectedRemotePageId: 'page-1',
        action: 'key',
        key: 'Enter',
        meta: false,
        ctrl: false,
        alt: false,
        shift: false,
        ...operation
      },
      expiresAt
    )
  return { provider, refresh, view, command, harness }
}
it('reuses the mounted input queue, coordinate mapping, focus and refresh with a released click receipt', async () => {
  const owner = mountOwner()
  await act(async () => {
    await owner.command({ action: 'click', x: 100, y: 75, button: 'left' })
  })
  expect(owner.provider.moves[0]).toMatchObject({
    worktree: 'folder:fixture',
    page: 'page-1',
    x: 200,
    y: 150
  })
  expect(owner.provider.held).toBe(false)
  expect(document.activeElement).toBe(owner.view.getByAltText('remote'))
  await act(async () => {
    await owner.command({ key: 'r', ctrl: true })
  })
  expect(owner.provider.keys).toEqual(['Control+r'])
  expect(owner.refresh).toHaveBeenLastCalledWith(expect.anything(), 400)
})
it('rejects unsupported keys and points before provider writes', async () => {
  const owner = mountOwner()
  await expect(owner.command({ key: 'Unidentified' })).rejects.toThrow(
    'remote_browser_key_unavailable'
  )
  await expect(owner.command({ action: 'click', x: 500, y: 1, button: 'left' })).rejects.toThrow(
    'remote_browser_point_outside_viewport'
  )
  expect(owner.provider.moves).toHaveLength(0)
  expect(owner.provider.keys).toHaveLength(0)
})

it('releases a possibly held click after unmount while refusing a success receipt', async () => {
  let release: (() => void) | undefined
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const owner = mountOwner(async (method) => {
    if (method === 'browser.mouseDown') {
      await barrier
    }
  })
  const pending = owner.command({ action: 'click', x: 10, y: 10, button: 'middle' })
  const rejected = expect(pending).rejects.toThrow('remote_browser_pane_unmounted_effect_unknown')
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(owner.provider.held).toBe(true)
  owner.view.unmount()
  await rejected
  release?.()
  await act(async () => {
    await barrier
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(owner.provider.held).toBe(false)
})
it('releases after a down error and reports an unverifiable release failure', async () => {
  const owner = mountOwner(async (method) => {
    if (method === 'browser.mouseDown') {
      throw new Error('ack lost')
    }
    if (method === 'browser.mouseUp') {
      throw new Error('transport lost')
    }
  })
  await expect(owner.command({ action: 'click', x: 10, y: 10, button: 'left' })).rejects.toThrow(
    'remote_browser_mouse_release_unverifiable'
  )
  expect(vi.mocked(callRuntimeRpc).mock.calls.map((call) => call[1])).toEqual([
    'browser.mouseMove',
    'browser.mouseDown',
    'browser.mouseUp'
  ])
})
