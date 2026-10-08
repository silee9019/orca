// @vitest-environment happy-dom
import { act, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useEmulatorPaneControls } from './use-emulator-pane-controls'
import { useEmulatorPaneCommands } from './use-emulator-pane-commands'
import { dispatchEmulatorFrameCommand } from './emulator-frame-command'
const service = vi.hoisted(() => ({ rpc: vi.fn(async () => {}) }))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: service.rpc }))
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
it('reuses pane rotation, visual state, stream refresh and epoch invalidation', async () => {
  let reset = () => {}
  const refresh = vi.fn()
  function PaneOwner() {
    const paneRef = useRef<HTMLDivElement>(null)
    const controls = useEmulatorPaneControls('folder-mobile', refresh)
    useEmulatorPaneCommands(paneRef, controls.sendRotate, true)
    useEffect(() => {
      reset = controls.resetVisualOrientation
    }, [controls.resetVisualOrientation])
    return (
      <div ref={paneRef} data-emulator-pane>
        {controls.visualOrientation}
      </div>
    )
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<PaneOwner />))
  try {
    let pending = dispatchEmulatorFrameCommand(container, { type: 'rotate' })
    await act(async () => {
      await expect(pending).resolves.toMatchObject({ visualOrientation: 'landscape' })
    })
    expect(container.textContent).toBe('landscape')
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(service.rpc).toHaveBeenLastCalledWith({ kind: 'local' }, 'emulator.rotate', {
      orientation: 'landscape_left',
      worktree: 'folder-mobile'
    })
    pending = dispatchEmulatorFrameCommand(container, { type: 'rotate' })
    await act(async () => {
      await expect(pending).resolves.toMatchObject({ visualOrientation: 'portrait' })
    })
    expect(container.textContent).toBe('portrait')
    let release: (() => void) | undefined
    service.rpc.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    pending = dispatchEmulatorFrameCommand(container, { type: 'rotate' })
    const rejected = expect(pending).rejects.toThrow('emulator_rotation_applied_unknown')
    await act(async () => {
      await Promise.resolve()
      reset()
      release?.()
    })
    await rejected
    expect(container.textContent).toBe('portrait')
    expect(refresh).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
