// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAcknowledgedViewerToggle } from './use-acknowledged-viewer-toggle'

describe('acknowledged viewer toggle target lifetime', () => {
  it('rejects an in-flight request when its target changes', async () => {
    const change = vi.fn()
    const hook = renderHook(({ key }) => useAcknowledgedViewerToggle(false, change, key), {
      initialProps: { key: 'session:first' }
    })
    const request = hook.result.current(true)
    const rejected = expect(request).rejects.toThrow('viewer_control_unmounted')
    hook.rerender({ key: 'session:second' })
    await rejected
    hook.unmount()
  })
  it('rejects concurrent requests and removes pending work on unmount', async () => {
    const hook = renderHook(() => useAcknowledgedViewerToggle(false, vi.fn(), 'session:first'))
    const request = hook.result.current(true)
    const rejected = expect(request).rejects.toThrow('viewer_control_unmounted')
    await expect(hook.result.current(false)).rejects.toThrow('viewer_control_busy')
    hook.unmount()
    await rejected
  })
})
