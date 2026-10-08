import { z } from 'zod'
import { BrowserGrabToastState } from '../../src/shared/rpc-contract/browser-grab-toast-params'
// @vitest-environment happy-dom
import { createElement, useRef, useState } from 'react'
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
import { seedBrowserOverlayFocusOwner } from '../../src/renderer/src/components/browser-pane/assemble-chrome/browser-overlay-focus.test-fixture'
import { BROWSER_GRAB_TOAST_COMMAND_SPECS } from '../../src/cli/specs/browser-grab-toast'
import { BROWSER_GRAB_TOAST_HANDLERS } from '../../src/cli/handlers/browser-grab-toast'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import { BrowserPageGrabToast } from '../../src/renderer/src/components/browser-pane/annotate/browser-page-grab-toast'
import { makeToastPayload } from '../../src/renderer/src/components/browser-pane/annotate/browser-grab-toast-command.fixture'
import type { BrowserPageGrabToastState } from '../../src/renderer/src/components/browser-pane/describe-page/browser-page-types'
function Surface() {
  const [toast, setToast] = useState<BrowserPageGrabToastState | null>(() => {
    const payload = makeToastPayload()
    payload.screenshot = {
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,Zml4dHVyZQ==',
      width: 1,
      height: 1
    }
    return { message: 'Copied', type: 'success', x: 0, y: 0, below: false, payload }
  })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  return toast
    ? createElement(BrowserPageGrabToast, {
        commandOwner: { page: 'page', active: true },
        grabToast: toast,
        setGrabToast: setToast,
        grabToastTimerRef: timer,
        dismissGrabToast: () => setToast(null)
      })
    : null
}
it('runs retained toast parser/socket/dispatcher/relay/actual owner with fake image ACK and public readback', async () => {
  const initial = useAppStore.getInitialState()
  const previous = Object.getOwnPropertyDescriptor(window, 'api')
  const target = seedBrowserOverlayFocusOwner()
  const write = vi.fn(async () => ({ written: true as const }))
  Reflect.set(window.api.ui, 'writeVerifiedClipboardImage', write)
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
  const run = async (action: 'copy' | 'status', nonce?: string) => {
    const specs = BROWSER_GRAB_TOAST_COMMAND_SPECS
    const args = [
      'browser',
      'grab-toast',
      action,
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
      '--json',
      ...(nonce ? ['--toast', nonce] : [])
    ]
    const parsed = parseArgs(
      args,
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_GRAB_TOAST_HANDLERS[`browser grab-toast ${action}`]({
      ...parsed,
      client: cli.client,
      cwd: 'fixture',
      json: true
    })
  }
  try {
    render(createElement(Surface))
    await run('status')
    const printed = output.mock.lastCall?.[0]
    if (typeof printed !== 'string') {
      throw new Error('missing status')
    }
    const receipt = z
      .object({ result: z.object({ grabToast: BrowserGrabToastState }) })
      .parse(JSON.parse(printed)).result.grabToast
    await run('copy', receipt.toastId)
    expect(write).toHaveBeenCalledExactlyOnceWith('data:image/png;base64,Zml4dHVyZQ==')
    expect(screen.getByText('Screenshotted')).not.toBeNull()
    expect(output.mock.lastCall?.[0]).toContain('"copied": true')
    expect(output.mock.lastCall?.[0]).not.toContain('base64')
    cli.useLegacyPeer()
    await expect(run('status')).rejects.toMatchObject({ code: 'incompatible_runtime' })
    expect(write).toHaveBeenCalledTimes(1)
  } finally {
    cleanup()
    await cli.close()
    useAppStore.setState(initial, true)
    vi.restoreAllMocks()
    if (previous) {
      Object.defineProperty(window, 'api', previous)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
