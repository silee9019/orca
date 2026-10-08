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
import { BROWSER_WEBAUTHN_FOCUS_COMMAND_SPECS } from '../../src/cli/specs/browser-webauthn-focus'
import { BROWSER_WEBAUTHN_FOCUS_HANDLERS } from '../../src/cli/handlers/browser-webauthn-focus'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { BrowserWebAuthnAccountDialog } from '../../src/renderer/src/components/browser-webauthn-account-dialog'
import { installWebAuthnDialogFixture } from '../../src/renderer/src/components/browser-webauthn-dialog.test-fixture'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
it('performs egress effects through parser/socket/relay and real mounted state owners', async () => {
  const initial = useAppStore.getInitialState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  const fixture = installWebAuthnDialogFixture()
  const dir = await mkdtemp(join(tmpdir(), 'orca-focus-fixture-'))
  const credential = join(dir, 'credential')
  await writeFile(credential, 'fixture-credential', { mode: 0o600 })
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
    const specs = BROWSER_WEBAUTHN_FOCUS_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'webauthn',
        'dialog-focus',
        '--viewer',
        'host',
        '--request',
        'request',
        '--page',
        'page',
        '--worktree',
        'folder:fixture',
        '--relying-party',
        'fixture.invalid',
        '--credential-file',
        credential,
        '--json'
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_WEBAUTHN_FOCUS_HANDLERS['browser webauthn dialog-focus']({
      ...parsed,
      client: cli.client,
      cwd: dir,
      json: true
    })
  }
  try {
    render(createElement(BrowserWebAuthnAccountDialog))
    fixture.push()
    screen.getByRole('button', { name: 'Cancel' }).focus()
    await run()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fixture Account' }))
    expect(output.mock.lastCall?.[0]).toContain('"focused": true')
    expect(output.mock.lastCall?.[0]).not.toContain('fixture-credential')
    expect(fixture.respond).not.toHaveBeenCalled()
    cli.useLegacyPeer()
    await expect(run()).rejects.toThrow('does not support mounted WebAuthn focus')
    expect(fixture.respond).not.toHaveBeenCalled()
  } finally {
    cleanup()
    await cli.close()
    await rm(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
    useAppStore.setState(initial, true)
    if (previous) {
      Object.defineProperty(window, 'api', previous)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
