import type { RemoteFilePickerCommand } from '../../../../shared/rpc-contract/remote-file-picker-params'
// @vitest-environment happy-dom
import { cleanup, render, waitFor, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RemoteFileBrowser } from './RemoteFileBrowser'
import { requestRemoteFilePicker } from '@/runtime/remote-file-picker-request'

const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('navigates and selects through the actual mounted picker owner and listing provider', async () => {
  const browsed: string[] = []
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        browseDir: async ({ targetId, dirPath }: { targetId: string; dirPath: string }) => {
          expect(targetId).toBe('ssh-fixture')
          browsed.push(dirPath)
          return {
            resolvedPath: dirPath === '~' ? '/home/fixture' : dirPath,
            entries: [{ name: 'folder', isDirectory: true }],
            pathFlavor: 'posix'
          }
        }
      }
    }
  })
  const selected = vi.fn()
  const canceled = vi.fn()
  render(<RemoteFileBrowser targetId="ssh-fixture" onSelect={selected} onCancel={canceled} />)
  await waitFor(() => expect(browsed).toEqual(['~']))
  const target = { kind: 'ssh' as const, id: 'ssh-fixture' }
  let state = await requestRemoteFilePicker({ target, action: 'status' }, Date.now() + 1000)
  expect(state.resolvedPath).toBe('/home/fixture')
  let navigating: ReturnType<typeof requestRemoteFilePicker> | undefined
  await act(async () => {
    navigating = requestRemoteFilePicker(
      { target, instance: state.instance, action: 'navigate', path: '/other' },
      Date.now() + 1000
    )
    void navigating.catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  if (!navigating) {
    throw new Error('navigation not started')
  }
  state = await navigating
  expect(state.resolvedPath).toBe('/other')
  expect(browsed).toEqual(['~', '/other'])
  await act(async () => {
    state = await requestRemoteFilePicker(
      { target, instance: state.instance, action: 'select' },
      Date.now() + 1000
    )
  })
  expect(selected).toHaveBeenCalledExactlyOnceWith('/other')
  expect(state.selectedPath).toBe('/other')
  await expect(
    requestRemoteFilePicker(
      { target, instance: 'stale-owner', action: 'cancel' },
      Date.now() + 1000
    )
  ).rejects.toThrow('unavailable')
  expect(canceled).not.toHaveBeenCalled()
})
it('isolates listing/home cache and instance identity when the selected execution target changes', async () => {
  const browsed: string[] = []
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        browseDir: async ({ targetId }: { targetId: string; dirPath: string }) => {
          browsed.push(targetId)
          return { resolvedPath: `/${targetId}`, entries: [], pathFlavor: 'posix' }
        }
      }
    }
  })
  const selected = vi.fn()
  const view = render(
    <RemoteFileBrowser targetId="first" onSelect={selected} onCancel={() => {}} />
  )
  await waitFor(() => expect(view.getAllByTitle('/first')[0]).toBeTruthy())
  const old = await requestRemoteFilePicker(
    { target: { kind: 'ssh', id: 'first' }, action: 'status' },
    Date.now() + 1000
  )
  view.rerender(<RemoteFileBrowser targetId="second" onSelect={selected} onCancel={() => {}} />)
  await waitFor(() => expect(view.getAllByTitle('/second')[0]).toBeTruthy())
  const current = await requestRemoteFilePicker(
    { target: { kind: 'ssh', id: 'second' }, action: 'status' },
    Date.now() + 1000
  )
  expect(browsed).toEqual(['first', 'second'])
  expect(current.instance).not.toBe(old.instance)
  await expect(
    requestRemoteFilePicker(
      { target: current.target, instance: old.instance, action: 'select' },
      Date.now() + 1000
    )
  ).rejects.toThrow('unavailable')
  expect(selected).not.toHaveBeenCalled()
})
it('rejects ambiguity and expiry before invoking picker selection callbacks', async () => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        browseDir: async () => ({ resolvedPath: '/fixture', entries: [], pathFlavor: 'posix' })
      }
    }
  })
  const selected = vi.fn()
  const first = render(
    <RemoteFileBrowser targetId="same" onSelect={selected} onCancel={() => {}} />
  )
  await waitFor(() => expect(first.getAllByTitle('/fixture').length).toBeGreaterThan(0))
  const target = { kind: 'ssh' as const, id: 'same' }
  const state = await requestRemoteFilePicker({ target, action: 'status' }, Date.now() + 1000)
  await expect(
    requestRemoteFilePicker({ target, instance: state.instance, action: 'select' }, Date.now() - 1)
  ).rejects.toThrow('expired')
  const second = render(
    <RemoteFileBrowser targetId="same" onSelect={selected} onCancel={() => {}} />
  )
  await expect(
    requestRemoteFilePicker({ target, action: 'status' }, Date.now() + 1000)
  ).rejects.toThrow('ambiguous')
  expect(selected).not.toHaveBeenCalled()
  second.unmount()
})
it('invalidates an in-flight browse receipt when its picker unmounts', async () => {
  let complete: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    complete = resolve
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        browseDir: async ({ dirPath }: { dirPath: string }) => {
          if (dirPath === '/pending') {
            await waiting
          }
          return {
            resolvedPath: dirPath === '~' ? '/fixture' : dirPath,
            entries: [],
            pathFlavor: 'posix'
          }
        }
      }
    }
  })
  const selected = vi.fn()
  const view = render(
    <RemoteFileBrowser targetId="fixture" onSelect={selected} onCancel={() => {}} />
  )
  await waitFor(() => expect(view.getAllByTitle('/fixture').length).toBeGreaterThan(0))
  const target = { kind: 'ssh' as const, id: 'fixture' }
  const state = await requestRemoteFilePicker({ target, action: 'status' }, Date.now() + 1000)
  let browsing: ReturnType<typeof requestRemoteFilePicker> | undefined
  await act(async () => {
    browsing = requestRemoteFilePicker(
      { target, instance: state.instance, action: 'navigate', path: '/pending' },
      Date.now() + 1000
    )
    void browsing.catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  view.unmount()
  if (!browsing) {
    throw new Error('browse not started')
  }
  await expect(browsing).rejects.toThrow('unmounted_effect_unknown')
  await act(async () => {
    complete?.()
    await waiting
  })
  expect(selected).not.toHaveBeenCalled()
})
it('reuses filter, path paste, key and row owners without substituting a direct directory RPC', async () => {
  const browsed: string[] = []
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ssh: {
        browseDir: async ({ dirPath }: { dirPath: string }) => {
          browsed.push(dirPath)
          return {
            resolvedPath: dirPath === '~' ? '/home/fixture' : dirPath,
            entries: [
              { name: 'folder', isDirectory: true },
              { name: 'note.txt', isDirectory: false }
            ],
            pathFlavor: 'posix'
          }
        }
      }
    }
  })
  const selected = vi.fn()
  const view = render(
    <RemoteFileBrowser targetId="fixture" onSelect={selected} onCancel={() => {}} />
  )
  await waitFor(() => expect(view.getAllByTitle('/home/fixture').length).toBeGreaterThan(0))
  const target = { kind: 'ssh' as const, id: 'fixture' }
  let state = await requestRemoteFilePicker({ target, action: 'status' }, Date.now() + 1000)
  const run = async (command: Omit<RemoteFilePickerCommand, 'target' | 'instance'>) => {
    let running: ReturnType<typeof requestRemoteFilePicker> | undefined
    await act(async () => {
      running = requestRemoteFilePicker(
        { ...command, target, instance: state.instance },
        Date.now() + 1500
      )
      void running.catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, command.action === 'row-click' ? 250 : 10))
    })
    if (!running) {
      throw new Error('command not started')
    }
    return running
  }
  state = await run({ action: 'input', text: 'fold' })
  expect(state.filter).toBe('fold')
  expect(view.getByPlaceholderText('Type to filter or enter a path…')).toHaveProperty(
    'value',
    'fold'
  )
  expect(browsed).toEqual(['~'])
  state = await run({ action: 'key', key: 'Enter' })
  expect(state.resolvedPath).toBe('/home/fixture/folder')
  state = await run({ action: 'paste', text: '/folder/' })
  await waitFor(() => expect(browsed).toContain('/folder'))
  state = await run({ action: 'status' })
  expect(state.previewPath).toBe('/folder')
  expect(state.resolvedPath).toBe('/home/fixture/folder')
  await expect(run({ action: 'select' })).rejects.toThrow('selection_disabled')
  const row = view.getAllByRole('button', { name: 'folder' }).at(-1)
  if (!row) {
    throw new Error('visible folder row missing')
  }
  view.getByPlaceholderText('Type to filter or enter a path…').blur()
  const pointer = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  await act(async () => {
    row.dispatchEvent(pointer)
  })
  expect(pointer.defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(view.getByPlaceholderText('Type to filter or enter a path…'))
  view.getByPlaceholderText('Type to filter or enter a path…').blur()
  state = await run({ action: 'focus-input' })
  expect(state.inputFocused).toBe(true)
  state = await run({ action: 'row-click', entry: 'note.txt' })
  expect(state.fileHint).toBe(true)
  state = await run({ action: 'row-click', entry: 'folder' })
  expect(state.resolvedPath).toBe('/folder/folder')
  expect(state.preview).toBe(false)
  state = await run({ action: 'key', key: 'Backspace' })
  expect(state.resolvedPath).toBe('/folder')
  state = await run({ action: 'input', text: '/folder/folder/' })
  await waitFor(async () => {
    state = await run({ action: 'status' })
    expect(state.previewPath).toBe('/folder/folder')
    expect(state.previewLoading).toBe(false)
  })
  let singleClick: ReturnType<typeof requestRemoteFilePicker> | undefined
  await act(async () => {
    singleClick = requestRemoteFilePicker(
      { target, instance: state.instance, action: 'row-click', entry: 'folder' },
      Date.now() + 1500
    )
    void singleClick.catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  state = await run({ action: 'row-select', entry: 'folder' })
  if (!singleClick) {
    throw new Error('single click not started')
  }
  await expect(singleClick).rejects.toThrow('click_superseded')
  expect(state.selectedPath).toBe('/folder/folder/folder')
  expect(selected).toHaveBeenCalledExactlyOnceWith('/folder/folder/folder')
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250))
  })
  expect(browsed).not.toContain('/folder/folder/folder')
})
