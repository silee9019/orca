// @vitest-environment happy-dom
import { useRef, useState, type Dispatch, type SetStateAction, type MutableRefObject } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { requestBrowserGrabToast } from '@/runtime/browser-grab-toast-request'
import { seedBrowserOverlayFocusOwner } from '../assemble-chrome/browser-overlay-focus.test-fixture'
import type { BrowserPageGrabToastState } from '../describe-page/browser-page-types'
import { BrowserPageGrabToast } from './browser-page-grab-toast'
import { makeToastPayload } from './browser-grab-toast-command.fixture'
const initial = useAppStore.getInitialState()
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function mount() {
  const target = { ...seedBrowserOverlayFocusOwner(), page: 'page' }
  const write = vi.fn(async () => ({ written: true as const }))
  Reflect.set(window.api.ui, 'writeVerifiedClipboardImage', write)
  const payload = makeToastPayload()
  payload.screenshot = {
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,Zml4dHVyZQ==',
    width: 1,
    height: 1
  }
  let active = true
  let currentTimer: MutableRefObject<ReturnType<typeof setTimeout> | undefined> | undefined
  let replace: Dispatch<SetStateAction<BrowserPageGrabToastState | null>> = () => {
    throw new Error('not mounted')
  }
  function Surface() {
    const [toast, setToast] = useState<BrowserPageGrabToastState | null>({
      message: 'Copied',
      type: 'success',
      x: 0,
      y: 0,
      below: false,
      payload
    })
    replace = setToast
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    currentTimer = timer
    return toast ? (
      <BrowserPageGrabToast
        commandOwner={{ page: 'page', active }}
        grabToast={toast}
        setGrabToast={setToast}
        grabToastTimerRef={timer}
        dismissGrabToast={() => setToast(null)}
      />
    ) : null
  }
  const view = render(<Surface />)
  return {
    target,
    getTimer: () => currentTimer,
    write,
    view,
    replace,
    setActive: (value: boolean) => {
      active = value
      view.rerender(<Surface />)
    }
  }
}
it('copies the retained toast screenshot and commits feedback without current grab/rearm', async () => {
  const { target, write } = mount()
  const status = await requestBrowserGrabToast({ ...target, action: 'status' }, Date.now() + 1000)
  let result: ReturnType<typeof requestBrowserGrabToast> | undefined
  await act(async () => {
    result = requestBrowserGrabToast(
      { ...target, action: 'copy', toastId: status.toastId },
      Date.now() + 1000
    )
    await Promise.resolve()
  })
  expect((await result)?.copied).toBe(true)
  expect(write).toHaveBeenCalledWith('data:image/png;base64,Zml4dHVyZQ==')
  expect(screen.getByText('Screenshotted')).not.toBeNull()
})

it.each(['nonce', 'host', 'group', 'expired', 'busy-modal'] as const)(
  'refuses %s before clipboard',
  async (reason) => {
    const { target, write } = mount()
    const status = await requestBrowserGrabToast({ ...target, action: 'status' }, Date.now() + 1000)
    if (reason === 'busy-modal') {
      useAppStore.setState({ activeModal: 'add-repo' })
    }
    await expect(
      requestBrowserGrabToast(
        {
          ...target,
          ...(reason === 'host' ? { executionHostId: 'ssh:other' } : {}),
          ...(reason === 'group' ? { groupId: 'other' } : {}),
          action: 'copy',
          toastId: reason === 'nonce' ? 'stale' : status.toastId
        },
        Date.now() + (reason === 'expired' ? -1 : 1000)
      )
    ).rejects.toThrow()
    expect(write).not.toHaveBeenCalled()
  }
)
it.each(['active-cycle', 'workspace-cycle', 'replacement', 'unmount', 'rejected'] as const)(
  'rejects held provider %s without feedback',
  async (reason) => {
    const { target, write, view, setActive, replace } = mount()
    let complete: (value: { written: true }) => void = () => {
      throw new Error('missing completion')
    }
    let fail: (error: Error) => void = () => {
      throw new Error('missing reject')
    }
    const held = new Promise<{ written: true }>((resolve, reject) => {
      complete = resolve
      fail = reject
    })
    write.mockImplementationOnce(() => held)
    const status = await requestBrowserGrabToast({ ...target, action: 'status' }, Date.now() + 1000)
    const request = requestBrowserGrabToast(
      { ...target, action: 'copy', toastId: status.toastId },
      Date.now() + 1000
    )
    const outcome = request.catch((error) => error)
    await expect(
      requestBrowserGrabToast(
        { ...target, action: 'copy', toastId: status.toastId },
        Date.now() + 1000
      )
    ).rejects.toThrow('busy')
    if (reason === 'active-cycle') {
      act(() => setActive(false))
      act(() => setActive(true))
    }
    if (reason === 'workspace-cycle') {
      useAppStore.setState({ activeWorktreeId: 'folder:other' })
      useAppStore.setState({ activeWorktreeId: target.worktreeId })
    }
    if (reason === 'replacement') {
      act(() =>
        replace((prev) =>
          prev
            ? {
                ...prev,
                payload: { ...makeToastPayload(), screenshot: prev.payload?.screenshot ?? null }
              }
            : null
        )
      )
    }
    if (reason === 'unmount') {
      view.unmount()
    }

    await act(async () => {
      if (reason === 'rejected') {
        fail(new Error('fixture provider rejection'))
      } else {
        complete({ written: true })
      }
      await Promise.resolve()
    })
    expect(await outcome).toBeInstanceOf(Error)
    expect(screen.queryByText('Screenshotted')).toBeNull()
    expect(write).toHaveBeenCalledTimes(1)
  }
)

it('preserves the original UI clipboard request and feedback without claiming verified delivery', async () => {
  const { write } = mount()
  const original = vi.fn(async () => {})
  Reflect.set(window.api.ui, 'writeClipboardImage', original)
  fireEvent.pointerDown(screen.getByRole('button'), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse'
  })
  await act(async () => {})
  await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /Copy Screenshot/ })))
  expect(original).toHaveBeenCalledWith('data:image/png;base64,Zml4dHVyZQ==')
  expect(write).not.toHaveBeenCalled()
  expect(screen.getByText('Screenshotted')).not.toBeNull()
})

it('refuses absent screenshots and a missing verified provider without UI fallback', async () => {
  const { target, write, replace } = mount()
  const status = await requestBrowserGrabToast({ ...target, action: 'status' }, Date.now() + 1000)
  Reflect.deleteProperty(window.api.ui, 'writeVerifiedClipboardImage')
  await expect(
    requestBrowserGrabToast(
      { ...target, action: 'copy', toastId: status.toastId },
      Date.now() + 1000
    )
  ).rejects.toThrow('copy_failed')
  act(() => replace((prev) => (prev ? { ...prev, payload: makeToastPayload() } : null)))
  await expect(
    requestBrowserGrabToast({ ...target, action: 'status' }, Date.now() + 1000)
  ).rejects.toThrow('target_changed')
  expect(write).not.toHaveBeenCalled()
  expect(screen.queryByText('Screenshotted')).toBeNull()
})
it('keeps SSH folder identity while clipboard delivery belongs to the host viewer', async () => {
  const { target } = mount()
  useAppStore.setState((state) => ({
    activeWorkspaceExecutionHostId: 'ssh:fixture',
    folderWorkspaces: state.folderWorkspaces.map((folder) => ({
      ...folder,
      executionHostId: 'ssh:fixture'
    }))
  }))
  const selected = { ...target, executionHostId: 'ssh:fixture' as const }
  const status = await requestBrowserGrabToast({ ...selected, action: 'status' }, Date.now() + 1000)
  let outcome: ReturnType<typeof requestBrowserGrabToast> | undefined
  await act(async () => {
    outcome = requestBrowserGrabToast(
      { ...selected, action: 'copy', toastId: status.toastId },
      Date.now() + 1000
    )
    await Promise.resolve()
  })
  expect((await outcome)?.executionHostId).toBe('ssh:fixture')
})

it('pauses the retained toast expiry while its actual menu is open and rearms it on close', async () => {
  const owner = mount()
  const open = async () => {
    fireEvent.pointerDown(screen.getByRole('button'), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse'
    })
    await act(async () => {})
  }
  const close = async () => {
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await act(async () => {})
  }
  await open()
  await close()
  const timer = owner.getTimer()
  const firstTimer = timer?.current
  if (!timer || firstTimer === undefined) {
    throw new Error('actual toast owner did not arm its expiry')
  }
  try {
    const cancel = vi.spyOn(globalThis, 'clearTimeout')
    const schedule = vi.spyOn(globalThis, 'setTimeout')
    await open()
    expect(screen.getByRole('menu')).not.toBeNull()
    expect(cancel).toHaveBeenCalledWith(firstTimer)
    await close()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 1200)
    expect(timer.current).not.toBe(firstTimer)
  } finally {
    clearTimeout(firstTimer)
    clearTimeout(timer.current)
  }
})
