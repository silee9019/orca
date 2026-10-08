// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import type { AppSurfaceRequest } from '../../../../shared/app-surface-control'
import { registerAppSurfaceIpcBridge, useAppSurfaceControl } from './app-surface-ipc-bridge'
let receive: ((request: AppSurfaceRequest) => void) | undefined
const reply = vi.fn()
afterEach(() => {
  delete window.orcaAppSurface
  vi.clearAllMocks()
})
function connect(): () => void {
  window.orcaAppSurface = {
    onRequest: (callback) => {
      receive = callback
      return () => {
        receive = undefined
      }
    },
    reply
  }
  return registerAppSurfaceIpcBridge()
}
const requestId = 'c8d153e4-ef16-4da8-b972-2fd3cecb378b'
describe('mounted surface callback bridge', () => {
  it('uses a live callback, exposes state readback, and removes listeners on unmount', async () => {
    const cleanup = connect()
    const hook = renderHook(() => {
      const [open, setOpen] = useState(false)
      useAppSurfaceControl('shell', (input) => {
        if (input.kind === 'shell' && input.action === 'sidebar') {
          setOpen(!open)
        }
        return { open }
      })
      return open
    })
    await act(async () => receive?.({ requestId, action: { kind: 'shell', action: 'sidebar' } }))
    expect(hook.result.current).toBe(true)
    await act(async () => receive?.({ requestId, action: { kind: 'shell', action: 'status' } }))
    await waitFor(() =>
      expect(reply).toHaveBeenLastCalledWith({ requestId, ok: true, result: { open: true } })
    )
    hook.unmount()
    receive?.({ requestId, action: { kind: 'shell', action: 'sidebar' } })
    await waitFor(() =>
      expect(reply.mock.lastCall?.[0]).toMatchObject({
        ok: false,
        error: expect.stringContaining('not mounted')
      })
    )
    cleanup()
  })
  it('rejects unsupported raw input before invoking a domain callback', async () => {
    const cleanup = connect()
    const run = vi.fn()
    const hook = renderHook(() => useAppSurfaceControl('vault', run))
    window.dispatchEvent(
      new CustomEvent('orca:app-surface-control', {
        detail: { action: { kind: 'vault', action: 'eval', script: 'bad' } }
      })
    )
    await Promise.resolve()
    expect(run).not.toHaveBeenCalled()
    hook.unmount()
    cleanup()
  })
})
