import { createElement } from 'react'
// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { useAppStore } from '../../src/renderer/src/store'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { seedBrowserOverlayFocusOwner } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-overlay-focus.test-fixture'
import { NativeToolbarFixture } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-toolbar-external.test-fixture'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { BROWSER_TOOLBAR_EXTERNAL_COMMAND_SPECS } from '../../src/cli/specs/browser-toolbar-external'
import { BROWSER_TOOLBAR_EXTERNAL_HANDLERS } from '../../src/cli/handlers/browser-toolbar-external'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
it('runs parser/socket/dispatcher/existing mounted toolbar owner and fake shell ACK with public readback and old-peer refusal', async () => {
  const initial = useAppStore.getInitialState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  const target = seedBrowserOverlayFocusOwner()
  const url = 'https://fixture.invalid/toolbar'
  useAppStore.getState().setBrowserPageUrl('page', url)
  const opened: string[] = []
  const open = vi.fn(async (value: string) => {
    opened.push(value)
    return { opened: true as const }
  })
  Reflect.set(window.api.shell, 'openVerifiedUrl', open)
  render(createElement(NativeToolbarFixture, { target }))
  const runtime = new OrcaRuntimeService()
  runtime.setNotifier({
    browserViewer: (command) =>
      applyBrowserViewerRequest({ id: 'toolbar-fixture', command, expiresAt: Date.now() + 2000 })
  })
  const cli = await createRemotePaneCliSocket(runtime)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async () => {
    const specs = BROWSER_TOOLBAR_EXTERNAL_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'toolbar-external',
        '--viewer',
        'host',
        '--page',
        'page',
        '--worktree',
        target.worktreeId,
        '--workspace',
        target.workspaceId,
        '--group',
        target.groupId,
        '--execution-host',
        target.executionHostId,
        '--url',
        url
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_TOOLBAR_EXTERNAL_HANDLERS['browser toolbar-external']({
      ...parsed,
      client: cli.client,
      cwd: '.',
      json: true
    })
  }
  try {
    await act(run)
    expect(opened).toEqual([url])
    expect(output.mock.lastCall?.[0]).toContain('"requested": true')
    expect(output.mock.lastCall?.[0]).toContain('"externalWindowVerified": false')
    expect(useAppStore.getState().browserPagesByWorkspace[target.workspaceId]?.[0].url).toBe(url)
    cli.useLegacyPeer()
    await expect(run()).rejects.toMatchObject({ code: 'incompatible_runtime' })
    expect(open).toHaveBeenCalledTimes(1)
  } finally {
    await cli.close()
    output.mockRestore()
    cleanup()
    useAppStore.setState(initial, true)
    if (previous) {
      Object.defineProperty(window, 'api', previous)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
