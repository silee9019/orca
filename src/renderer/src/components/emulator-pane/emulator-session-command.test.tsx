// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useEmulatorPaneSession } from './use-emulator-pane-session'
import { useEmulatorSessionCommands } from './use-emulator-session-commands'
import { dispatchEmulatorFrameCommand } from './emulator-frame-command'
import { cancelPendingSimulatorPaneShutdown } from '@/lib/simulator-pane-shutdown-scheduler'

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })

it('reads back actual selected session and shutdown suppression through the pane owner', async () => {
  let booted = false
  const calls: string[] = []
  const runtime = vi.fn(async ({ method }: { method: string }) => {
    calls.push(method)
    let result: unknown
    if (method === 'emulator.listDevices') {
      result = [
        {
          backend: 'ios',
          id: 'device-a',
          name: 'Phone A',
          state: booted ? 'booted' : 'shutdown',
          isAvailable: true
        }
      ]
    } else if (method === 'emulator.attach') {
      booted = true
      result = {
        attached: true,
        info: {
          deviceUdid: 'device-a',
          streamUrl: 'http://fixture/stream',
          wsUrl: 'ws://fixture/ws'
        }
      }
    } else if (method === 'emulator.shutdown') {
      booted = false
      result = { deviceUdid: 'device-a' }
    } else {
      throw new Error(method)
    }
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture' } }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { runtime: { call: runtime } }
  })
  function Owner() {
    const paneRef = useRef<HTMLDivElement>(null)
    const session = useEmulatorPaneSession({
      worktreeId: 'folder:session',
      autoAttachOnMount: false
    })
    useEmulatorSessionCommands(paneRef, session)
    return (
      <div ref={paneRef} data-emulator-pane>
        {session.selectedUdid}:{session.isLive ? 'live' : 'stopped'}:{session.error}
      </div>
    )
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<Owner />))
    for (const type of ['attach-view', 'shutdown-view'] as const) {
      let pending: ReturnType<typeof dispatchEmulatorFrameCommand> | undefined
      act(() => {
        pending = dispatchEmulatorFrameCommand(container, { type, device: 'device-a' })
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      await expect(pending).resolves.toMatchObject({
        sessionState: { selectedUdid: 'device-a', isLive: type === 'attach-view', loading: false }
      })
      expect(container.textContent).toBe(`device-a:${type === 'attach-view' ? 'live' : 'stopped'}:`)
      expect(booted).toBe(type === 'attach-view')
    }
    expect(calls.filter((method) => method === 'emulator.attach')).toHaveLength(1)
    const before = runtime.mock.calls.length
    await expect(
      dispatchEmulatorFrameCommand(container, { type: 'shutdown-view', device: 'other-device' })
    ).rejects.toThrow('target_changed')
    expect(runtime).toHaveBeenCalledTimes(before)
    let finish: (() => void) | undefined
    runtime.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return {
        id: 'fixture',
        ok: true,
        result: {
          attached: true,
          info: { deviceUdid: 'device-a', streamUrl: 'http://fixture/stream' }
        },
        _meta: { runtimeId: 'fixture' }
      }
    })
    let pending: ReturnType<typeof dispatchEmulatorFrameCommand> | undefined
    act(() => {
      pending = dispatchEmulatorFrameCommand(container, { type: 'attach-view', device: 'device-a' })
    })
    const unknown = expect(pending).rejects.toThrow('unmounted_effect_unknown')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await expect(
      dispatchEmulatorFrameCommand(container, { type: 'attach-view', device: 'device-a' })
    ).rejects.toThrow('busy')
    await act(async () => root.unmount())
    await unknown
    await act(async () => {
      finish?.()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(runtime).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'emulator.shutdown',
        params: { worktree: 'folder:session', managedOnly: true }
      })
    )
  } finally {
    await act(async () => root.unmount())
    cancelPendingSimulatorPaneShutdown('folder:session')
    container.remove()
    Reflect.deleteProperty(window, 'api')
  }
})
