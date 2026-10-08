import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserWindow } from 'electron'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { desktopAppTarget } from '../runtime/rpc/methods/desktop-app-target'
import { requestAppControl, setAppControlReloadPolicy } from './app-lifecycle-control'

const fixture = vi.hoisted(() => {
  const commits = new Map<string, (event: { sender: object }, id: unknown) => Promise<unknown>>()
  const events = new Map<string, (event: { sender: object }, id: unknown) => void>()
  const webContents = { send: vi.fn(), isDestroyed: () => false }
  const window = { id: 7, isDestroyed: () => false, webContents }
  return {
    commits,
    events,
    window,
    quit: vi.fn(),
    restart: vi.fn(),
    install: vi.fn(),
    updateState: 'downloaded'
  }
})
vi.mock('electron', () => ({
  app: { quit: fixture.quit },
  BrowserWindow: class {
    static fromId(id: number) {
      return id === 7 ? fixture.window : null
    }
    static getAllWindows() {
      return [fixture.window]
    }
  },
  ipcMain: {
    handle: (name: string, handler: (event: { sender: object }, id: unknown) => Promise<unknown>) =>
      fixture.commits.set(name, handler),
    on: (name: string, handler: (event: { sender: object }, id: unknown) => void) =>
      fixture.events.set(name, handler)
  }
}))
vi.mock('../ipc/ui', () => ({
  isTrustedUIRenderer: (sender: object) => sender === fixture.window.webContents
}))
vi.mock('../ipc/app', () => ({ requestDesktopAppRestart: fixture.restart }))
vi.mock('../updater', () => ({
  getUpdateStatus: () => ({ state: fixture.updateState }),
  quitAndInstall: fixture.install
}))
vi.mock('../runtime/orca-runtime', () => ({
  OrcaRuntimeService: class {
    getRuntimeId() {
      return 'fixture-host'
    }
    getStatus() {
      return { desktopWindowStatus: 'available' }
    }
  }
}))
const context = { runtime: OrcaRuntimeService.prototype }
function request(
  action: 'quit' | 'restart' | 'relaunch' | 'reload' | 'install-update',
  signal?: AbortSignal
): Promise<unknown> {
  return requestAppControl(
    { action, viewer: 7, confirmTarget: desktopAppTarget(context) },
    { ...context, signal }
  )
}
function requestId(): string {
  const last = fixture.window.webContents.send.mock.lastCall
  const payload: unknown = last?.[1]
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('requestId' in payload) ||
    typeof payload.requestId !== 'string'
  ) {
    throw new Error('No checkpoint request sent')
  }
  return payload.requestId
}
async function commit(sender: object, id = requestId()): Promise<unknown> {
  const handler = fixture.commits.get('app-control:commit')
  if (!handler) {
    throw new Error('Commit handler missing')
  }
  return handler({ sender }, id)
}
beforeEach(() => {
  Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
  fixture.updateState = 'downloaded'
  vi.useFakeTimers()
})
afterEach(() => {
  Reflect.deleteProperty(process.versions, 'electron')
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('desktop checkpoint request', () => {
  it('waits for the selected renderer checkpoint and invokes restart only once', async () => {
    const operation = request('restart')
    expect(fixture.restart).not.toHaveBeenCalled()
    const id = requestId()
    await commit(fixture.window.webContents, id)
    await expect(operation).resolves.toEqual({
      state: 'accepted',
      action: 'restart',
      viewer: 7,
      target: desktopAppTarget(context)
    })
    expect(fixture.restart).toHaveBeenCalledWith('restart')
    await expect(commit(fixture.window.webContents, id)).rejects.toThrow('expired')
    expect(fixture.restart).toHaveBeenCalledOnce()
  })
  it('reuses the attached reload policy after checkpointing', async () => {
    const window = BrowserWindow.fromId(7)
    if (!window) {
      throw new Error('Fixture viewer missing')
    }
    const reload = vi.fn()
    setAppControlReloadPolicy(window, reload)
    const operation = request('reload')
    await commit(fixture.window.webContents)
    await operation
    expect(reload).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledOnce()
  })
  it('installs only a ready update after a successful checkpoint', async () => {
    const operation = request('install-update')
    await commit(fixture.window.webContents)
    await operation
    expect(fixture.install).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(fixture.install).toHaveBeenCalledOnce()
    fixture.updateState = 'downloading'
    const unavailable = request('install-update')
    const rejected = expect(unavailable).rejects.toThrow('ready')
    await expect(commit(fixture.window.webContents)).rejects.toThrow('ready')
    await rejected
    await vi.advanceTimersByTimeAsync(150)
    expect(fixture.install).toHaveBeenCalledOnce()
  })
  it('aborts when the selected viewer cannot checkpoint', async () => {
    const operation = request('quit')
    const rejection = expect(operation).rejects.toThrow('checkpoint failed')
    const failed = fixture.events.get('app-control:failed')
    if (!failed) {
      throw new Error('Failure handler missing')
    }
    failed({ sender: fixture.window.webContents }, requestId())
    await rejection
    expect(fixture.quit).not.toHaveBeenCalled()
  })
  it('rejects another renderer and leaves the genuine checkpoint pending', async () => {
    const operation = request('quit')
    await expect(commit({})).rejects.toThrow('another viewer')
    expect(fixture.quit).not.toHaveBeenCalled()
    await commit(fixture.window.webContents)
    await operation
    await vi.advanceTimersByTimeAsync(150)
    expect(fixture.quit).toHaveBeenCalledOnce()
  })
  it('never accepts a late checkpoint after caller disconnect', async () => {
    const controller = new AbortController()
    const operation = request('install-update', controller.signal)
    const rejection = expect(operation).rejects.toThrow('disconnected')
    const id = requestId()
    controller.abort()
    await rejection
    await expect(commit(fixture.window.webContents, id)).rejects.toThrow('expired')
    expect(fixture.install).not.toHaveBeenCalled()
  })
  it('times out without performing the requested effect', async () => {
    const operation = request('relaunch')
    const rejection = expect(operation).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(25_000)
    await rejection
    expect(fixture.restart).not.toHaveBeenCalled()
  })
  it('refuses an unavailable viewer without asking another window', async () => {
    await expect(
      requestAppControl(
        { action: 'quit', viewer: 99, confirmTarget: desktopAppTarget(context) },
        context
      )
    ).rejects.toThrow('unavailable')
    expect(fixture.window.webContents.send).not.toHaveBeenCalled()
  })
})
