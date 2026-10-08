// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { useAppStore } from '../../src/renderer/src/store'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { seedBrowserOverlayFocusOwner } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-overlay-focus.test-fixture'
import { NativeToolbarFixture } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-toolbar-external.test-fixture'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { BROWSER_VIEWER_COMMAND_SPECS } from '../../src/cli/specs/browser-viewer'
import { BROWSER_VIEWER_HANDLERS } from '../../src/cli/handlers/browser-viewer'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
it('runs shortcut-only history through parser/socket/actual toolbar without document conversion', async () => {
  const initial = useAppStore.getState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  const target = seedBrowserOverlayFocusOwner()
  useAppStore.setState({ activeModal: 'none', activeView: 'terminal' })
  let index = 1
  const urls = ['https://first.test/', 'https://second.test/']
  const fake: Pick<
    Electron.WebviewTag,
    'getURL' | 'getTitle' | 'isLoading' | 'canGoBack' | 'canGoForward' | 'goBack' | 'goForward'
  > = {
    getURL: () => urls[index],
    getTitle: () => 'Fixture',
    isLoading: () => true,
    canGoBack: () => index > 0,
    canGoForward: () => index < 1,
    goBack: vi.fn(() => {
      index--
    }),
    goForward: vi.fn(() => {
      index++
    })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fake implements the metadata/history methods read by the mounted owner; no native guest is started.
  const guest = fake as Electron.WebviewTag
  render(
    createElement(NativeToolbarFixture, { target, history: { webviewRef: { current: guest } } })
  )
  const before = useAppStore.getState().browserPagesByWorkspace[target.workspaceId]
  const runtime = new OrcaRuntimeService()
  runtime.setNotifier({
    browserViewer: (command) =>
      applyBrowserViewerRequest({ id: 'history-fixture', command, expiresAt: Date.now() + 2000 })
  })
  const cli = await createRemotePaneCliSocket(runtime)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async (action: 'back-shortcut' | 'forward-shortcut') => {
    const specs = BROWSER_VIEWER_COMMAND_SPECS
    const parsed = parseArgs(
      ['browser', 'toolbar-nav', '--viewer', 'host', '--page', 'page', '--action', action],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_VIEWER_HANDLERS['browser toolbar-nav']({
      ...parsed,
      client: cli.client,
      cwd: '.',
      json: true
    })
  }
  try {
    await act(() => run('back-shortcut'))
    expect(fake.getURL()).toBe(urls[0])
    expect(output.mock.lastCall?.[0]).toContain('back-shortcut')
    await act(() => run('forward-shortcut'))
    expect(fake.getURL()).toBe(urls[1])
    expect(useAppStore.getState().browserPagesByWorkspace[target.workspaceId]).toEqual(before)
    cli.useLegacyPeer()
    await expect(run('back-shortcut')).rejects.toMatchObject({ code: 'method_not_found' })
    expect(fake.goBack).toHaveBeenCalledTimes(1)
    expect(fake.goForward).toHaveBeenCalledTimes(1)
  } finally {
    await cli.close()
    output.mockRestore()
    cleanup()
    useAppStore.setState(initial, true)
    expect(useAppStore.getState()).toBe(initial)
    if (previous) {
      Object.defineProperty(window, 'api', previous)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
