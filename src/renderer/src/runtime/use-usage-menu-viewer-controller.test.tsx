// @vitest-environment happy-dom
import { useState } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useUsageMenuViewerController } from './use-usage-menu-viewer-controller'
import { closeUsageMenuIfMounted, setUsageMenuOpenViaViewer } from './usage-menu-controller'

describe('mounted usage menu controller', () => {
  it('acknowledges committed React state and unregisters on unmount', async () => {
    const effect = vi.fn()
    const retainFocus = vi.fn()
    const hook = renderHook(() => {
      const [open, setOpen] = useState(false)
      useUsageMenuViewerController(
        open,
        (value) => {
          effect(value)
          setOpen(value)
        },
        true,
        retainFocus
      )
      return open
    })
    let request: Promise<{ open: boolean }> | undefined
    act(() => {
      request = setUsageMenuOpenViaViewer(true)
    })
    await expect(request).resolves.toEqual({ open: true })
    expect(hook.result.current).toBe(true)
    expect(effect).toHaveBeenCalledExactlyOnceWith(true)
    act(() => {
      request = setUsageMenuOpenViaViewer(false, true)
    })
    await expect(request).resolves.toEqual({ open: false })
    expect(hook.result.current).toBe(false)
    expect(retainFocus).toHaveBeenCalledOnce()
    await expect(closeUsageMenuIfMounted()).resolves.toEqual({ mounted: true, open: false })
    hook.unmount()
    await expect(closeUsageMenuIfMounted()).resolves.toEqual({ mounted: false, open: false })
    await expect(setUsageMenuOpenViaViewer(true)).rejects.toThrow('usage_menu_unavailable')
  })
})
