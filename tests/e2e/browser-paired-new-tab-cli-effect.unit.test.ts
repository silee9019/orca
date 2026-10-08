import { replaceRuntimeEnvironmentRevisions } from '../../src/renderer/src/runtime/runtime-environment-revision'
import { z } from 'zod'
import { BrowserPairedNewTabState } from '../../src/shared/rpc-contract/browser-paired-new-tab-params'
// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    ipcMain: new EventEmitter(),
    BrowserWindow: class extends EventEmitter {
      id = 74
      isDestroyed = () => false
      webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() })
    }
  }
})
import { BrowserWindow, ipcMain } from 'electron'
import { requestBrowserViewerFromRenderer } from '../../src/main/window/browser-viewer-request-relay'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import type {
  BrowserViewerResult,
  BrowserViewerRequest
} from '../../src/shared/browser-viewer-command'
import { useAppStore } from '../../src/renderer/src/store'
import { BROWSER_PAIRED_NEW_TAB_COMMAND_SPECS } from '../../src/cli/specs/browser-paired-new-tab'
import { BROWSER_PAIRED_NEW_TAB_HANDLERS } from '../../src/cli/handlers/browser-paired-new-tab'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import {
  BrowserPairedNewTabSourceSurface,
  seedBrowserPairedNewTabOwner
} from '../../src/renderer/src/hooks/ipc-events/browser-paired-new-tab.test-fixture'
import {
  pendingCreates,
  publishHostSnapshot
} from '../../src/renderer/src/runtime/web-runtime-browser-creation-placement-test-rig'
import type * as SnapshotModule from '../../src/renderer/src/runtime/web-runtime-session-snapshot'
vi.mock('../../src/renderer/src/runtime/web-runtime-session', async () => ({
  createWebRuntimeSessionBrowserTab: (
    await import('../../src/renderer/src/runtime/web-runtime-browser-creation')
  ).createWebRuntimeSessionBrowserTab
}))
vi.mock('../../src/renderer/src/runtime/web-runtime-session-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof SnapshotModule>()),
  refreshWebRuntimeSessionTabsSnapshot: vi.fn(async () => publishHostSnapshot())
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
it('runs paired new tab parser/socket/dispatcher/relay/actual creation lifetime owner with fake provider and materialization readback', async () => {
  const initial = useAppStore.getInitialState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  const { target, call } = seedBrowserPairedNewTabOwner()
  const implementation = call.getMockImplementation()
  if (!implementation) {
    throw new Error('missing provider implementation')
  }
  let signal = () => {}
  const started = new Promise<void>((resolve) => {
    signal = resolve
  })
  call.mockImplementation((request) => {
    const response = implementation(request)
    if (request.method === 'browser.tabCreate') {
      signal()
    }
    return response
  })
  const runtime = new OrcaRuntimeService()
  const cli = await createRemotePaneCliSocket(runtime)
  const fixtureWindow = new BrowserWindow()
  runtime.setNotifier({
    browserViewer: (command) => requestBrowserViewerFromRenderer(fixtureWindow, command)
  })
  vi.spyOn(fixtureWindow.webContents, 'send').mockImplementation(
    (_channel, request: BrowserViewerRequest) => {
      let applied: Promise<BrowserViewerResult> | undefined
      void Promise.resolve(
        act(async () => {
          applied = applyBrowserViewerRequest(request)
          void applied.catch(() => {})
        })
      )
        .then(() => {
          if (!applied) {
            throw new Error('missing renderer request')
          }
          return applied
        })
        .then(
          (result) =>
            ipcMain.emit(
              'ui:browserViewerResponse',
              { sender: fixtureWindow.webContents },
              { id: request.id, ok: true, result }
            ),
          (error: unknown) =>
            ipcMain.emit(
              'ui:browserViewerResponse',
              { sender: fixtureWindow.webContents },
              {
                id: request.id,
                ok: false,
                error: error instanceof Error ? error.message : String(error)
              }
            )
        )
    }
  )
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = async () => {
    const specs = BROWSER_PAIRED_NEW_TAB_COMMAND_SPECS
    const args = [
      'browser',
      'new-ui-paired',
      '--viewer',
      'host',
      '--worktree',
      target.worktree,
      '--group',
      target.group ?? '',
      '--execution-host',
      target.executionHostId,
      '--runtime-environment',
      target.environmentId,
      '--pairing-revision',
      String(target.pairingRevision),
      '--confirm',
      '--json'
    ]
    const parsed = parseArgs(
      args,
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_PAIRED_NEW_TAB_HANDLERS['browser new-ui-paired']({
      ...parsed,
      client: cli.client,
      cwd: 'fixture',
      json: true
    })
  }

  try {
    render(createElement(BrowserPairedNewTabSourceSurface))
    const result = run()
    void result.catch(() => {})
    await started
    expect(pendingCreates).toHaveLength(1)
    pendingCreates[0].resolve('fixture-created-server')
    await result
    expect(screen.queryByRole('button')).toBeNull()
    const printed = output.mock.lastCall?.[0]
    if (typeof printed !== 'string') {
      throw new Error('missing receipt')
    }
    const receipt = z
      .object({ result: z.object({ pairedNewTab: BrowserPairedNewTabState }) })
      .parse(JSON.parse(printed)).result.pairedNewTab
    expect(receipt).toMatchObject({ materialized: true, remotePageId: 'fixture-created-server' })
    expect(
      Object.values(useAppStore.getState().remoteBrowserPageHandlesByPageId).some(
        (handle) => handle.remotePageId === receipt.remotePageId && !handle.staged
      )
    ).toBe(true)
    expect(printed).not.toContain('https://')
    cli.useLegacyPeer()
    await expect(run()).rejects.toMatchObject({ code: 'incompatible_runtime' })
    expect(pendingCreates).toHaveLength(1)
  } finally {
    cleanup()
    await cli.close()
    useAppStore.setState(initial, true)
    vi.restoreAllMocks()
    replaceRuntimeEnvironmentRevisions([])
    if (previous) {
      Object.defineProperty(window, 'api', previous)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
