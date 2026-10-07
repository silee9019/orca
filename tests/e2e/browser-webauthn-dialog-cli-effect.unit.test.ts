// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { useAppStore } from '@/store'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { BrowserWebAuthnAccountDialog } from '../../src/renderer/src/components/browser-webauthn-account-dialog'
import { installWebAuthnDialogFixture } from '../../src/renderer/src/components/browser-webauthn-dialog.test-fixture'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { requestBrowserViewerFromRenderer } from '../../src/main/window/browser-viewer-request-relay'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import type { BrowserViewerRequest } from '../../src/shared/browser-viewer-command'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'

const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('executes cancel and selection from parser/socket through the actual dialog and accepted provider read-back', async () => {
  const provider = installWebAuthnDialogFixture()
  render(createElement(BrowserWebAuthnAccountDialog))
  provider.push()
  const fixtureWindow = new BrowserWindow()
  const runtime = new OrcaRuntimeService()
  runtime.setNotifier({
    browserViewer: (command) => requestBrowserViewerFromRenderer(fixtureWindow, command)
  })
  vi.mocked(fixtureWindow.webContents.send).mockImplementation(
    (_channel, request: BrowserViewerRequest) => {
      void applyBrowserViewerRequest(request).then(
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
  const cli = await createRemotePaneCliSocket(runtime)
  const dir = await mkdtemp(path.join(tmpdir(), 'orca-webauthn-fixture-'))
  const credentialFile = path.join(dir, 'credential.txt')
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const run = (extra = ['--cancel']) =>
    cli.runWebAuthnDialog([
      '--page',
      'page',
      '--worktree',
      'folder:fixture',
      '--request',
      'request',
      '--relying-party',
      'fixture.invalid',
      '--confirm',
      ...extra
    ])
  try {
    provider.respond.mockResolvedValueOnce(false)
    await act(async () => {
      await expect(run()).rejects.toThrow('response_refused')
    })
    expect(screen.queryByRole('dialog')).not.toBeNull()
    await act(async () => {
      await run()
    })
    expect(provider.accepted).toEqual([{ requestId: 'request', credentialId: null }])
    expect(screen.queryByRole('dialog')).toBeNull()
    provider.push()
    await writeFile(credentialFile, 'fixture-credential')
    await act(async () => {
      await run(['--credential-file', credentialFile])
    })
    expect(provider.accepted).toEqual([
      { requestId: 'request', credentialId: null },
      { requestId: 'request', credentialId: 'fixture-credential' }
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(output.mock.calls.map((call) => String(call[0])).join('')).not.toContain(
      'fixture-credential'
    )
    expect(output.mock.lastCall?.[0]).toContain('"removed": true')
    provider.push()
    cli.useLegacyPeer()
    await expect(run()).rejects.toThrow('does not support mounted WebAuthn')
    expect(provider.accepted).toHaveLength(2)
  } finally {
    await cli.close()
    await rm(dir, { recursive: true, force: true })
  }
})
