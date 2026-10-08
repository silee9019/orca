// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { useBrowserPageDownloadActions } from './use-browser-page-download-actions'
import { requestBrowserDownload } from '@/runtime/browser-download-request'
import type {
  BrowserDownloadRequestedEvent,
  BrowserDownloadFinishedEvent
} from '../../../../../shared/browser-guest-events'
vi.mock('../browser-download-destination-toast', () => ({
  emitBrowserRemoteDownloadToast: vi.fn()
}))
const requested = new Set<(value: BrowserDownloadRequestedEvent) => void>()
const finished = new Set<(value: BrowserDownloadFinishedEvent) => void>()
const shell = { openFilePath: vi.fn(), openInFileManager: vi.fn() }
const savePath = join(tmpdir(), 'orca-download-fixture.txt')
function useOwner(active = true) {
  const [notice, setNotice] = useState<string | null>(null)
  const actions = useBrowserPageDownloadActions('page', active, setNotice)
  return { ...actions, notice }
}
async function seed(page = 'page', path: string | null = savePath): Promise<void> {
  await act(async () => {
    for (const callback of requested) {
      callback({
        browserPageId: page,
        downloadId: 'download',
        origin: 'https://fixture.invalid',
        filename: 'fixture.txt',
        totalBytes: 4,
        mimeType: 'text/plain',
        savePath: path ?? savePath,
        status: 'downloading'
      })
    }
    for (const callback of finished) {
      callback({
        browserPageId: page,
        downloadId: 'download',
        status: 'completed',
        savePath: path,
        error: null
      })
    }
  })
}
async function command(action: 'open' | 'show' | 'dismiss' | 'status') {
  let result: ReturnType<typeof requestBrowserDownload> | undefined
  await act(async () => {
    result = requestBrowserDownload('page', 'download', action, Date.now() + 2000)
    void result.catch(() => {})
  })
  if (!result) {
    throw new Error('missing_request')
  }
  return result
}
beforeEach(() => {
  vi.clearAllMocks()
  requested.clear()
  finished.clear()
  shell.openFilePath.mockResolvedValue(true)
  shell.openInFileManager.mockResolvedValue({ ok: true })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      shell,
      browser: {
        onDownloadRequested: (callback: (value: BrowserDownloadRequestedEvent) => void) => {
          requested.add(callback)
          return () => requested.delete(callback)
        },
        onDownloadProgress: () => () => {},
        onDownloadFinished: (callback: (value: BrowserDownloadFinishedEvent) => void) => {
          finished.add(callback)
          return () => finished.delete(callback)
        }
      }
    }
  })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'api')
})
it('observes original download events, shell acknowledgements and committed dismissal', async () => {
  const owner = renderHook(() => useOwner())
  await seed()
  expect(await command('status')).toMatchObject({ present: true, status: 'completed' })
  expect(await command('open')).toMatchObject({ action: 'open', accepted: true })
  expect(shell.openFilePath).toHaveBeenCalledExactlyOnceWith(savePath)
  expect(await command('show')).toMatchObject({ action: 'show', accepted: true })
  expect(shell.openInFileManager).toHaveBeenCalledExactlyOnceWith(savePath)
  expect(await command('dismiss')).toMatchObject({ present: false, accepted: true })
  expect(owner.result.current.visibleDownloads).toEqual([])
})
it('preserves original UI callbacks and explicit shell rejection resource notices', async () => {
  const owner = renderHook(() => useOwner())
  await seed()
  shell.openFilePath.mockResolvedValueOnce(false)
  await expect(command('open')).rejects.toThrow('native_rejected')
  expect(owner.result.current.notice).toContain('Could not open')
  shell.openInFileManager.mockResolvedValueOnce({ ok: false })
  await expect(command('show')).rejects.toThrow('native_rejected')
  expect(owner.result.current.notice).toContain('Could not show')
  const download = owner.result.current.visibleDownloads[0]
  if (!download) {
    throw new Error('download_missing')
  }
  await act(async () => {
    expect(await owner.result.current.handleOpenDownloadedFile(download)).toBe(true)
  })
  expect(shell.openFilePath).toHaveBeenCalledTimes(2)
})
it('rejects missing paths and old void acknowledgements without reporting success', async () => {
  renderHook(() => useOwner())
  await seed('page', null)
  await expect(command('open')).rejects.toThrow('native_rejected')
  expect(shell.openFilePath).not.toHaveBeenCalled()
  await seed()
  shell.openFilePath.mockResolvedValueOnce(undefined)
  await expect(command('open')).rejects.toThrow('native_rejected')
})
it('rejects foreign events, inactive owners and duplicate active owners before shell effects', async () => {
  renderHook(() => useOwner())
  await seed('foreign')
  await expect(command('open')).rejects.toThrow('not_found')
  cleanup()
  renderHook(() => useOwner(false))
  await seed()
  await expect(command('open')).rejects.toThrow('inactive')
  cleanup()
  renderHook(() => useOwner())
  renderHook(() => useOwner())
  await seed()
  await expect(command('open')).rejects.toThrow('ambiguous')
  expect(shell.openFilePath).not.toHaveBeenCalled()
})
it('does not accept expired commands or an unmounted owner', async () => {
  const owner = renderHook(() => useOwner())
  await seed()
  await expect(requestBrowserDownload('page', 'download', 'open', Date.now() - 1)).rejects.toThrow(
    'expired'
  )
  owner.unmount()
  await expect(command('open')).rejects.toThrow('unavailable')
  expect(shell.openFilePath).not.toHaveBeenCalled()
})
it('rejects a competing operation and disposal before a late shell acknowledgement', async () => {
  const owner = renderHook(() => useOwner())
  await seed()
  let complete: (value: boolean) => void = () => {
    throw new Error('shell_not_pending')
  }
  shell.openFilePath.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        complete = resolve
      })
  )
  let pending: ReturnType<typeof requestBrowserDownload> | undefined
  await act(async () => {
    pending = requestBrowserDownload('page', 'download', 'open', Date.now() + 2000)
    void pending.catch(() => {})
  })
  await expect(command('show')).rejects.toThrow('busy')
  owner.unmount()
  await expect(pending).rejects.toThrow('owner_unavailable')
  await act(async () => {
    complete(true)
  })
  expect(shell.openFilePath).toHaveBeenCalledOnce()
  expect(shell.openInFileManager).not.toHaveBeenCalled()
})
it('rejects changed download ownership after the shell was invoked', async () => {
  renderHook(() => useOwner())
  await seed()
  shell.openFilePath.mockImplementationOnce(async () => {
    for (const callback of finished) {
      callback({
        browserPageId: 'page',
        downloadId: 'download',
        status: 'completed',
        savePath: join(tmpdir(), 'replacement.txt'),
        error: null
      })
    }
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve)
    })
    return true
  })
  await expect(command('open')).rejects.toThrow('owner_changed')
})
it('does not let an old acknowledgement unlock the new request after owner reactivation', async () => {
  const owner = renderHook(({ active }) => useOwner(active), { initialProps: { active: true } })
  await seed()
  let oldComplete: (value: boolean) => void = () => {
    throw new Error('old_not_pending')
  }
  let nextComplete: (value: boolean) => void = () => {
    throw new Error('next_not_pending')
  }
  shell.openFilePath.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        oldComplete = resolve
      })
  )
  shell.openFilePath.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        nextComplete = resolve
      })
  )
  let oldRequest: ReturnType<typeof requestBrowserDownload> | undefined
  let nextRequest: ReturnType<typeof requestBrowserDownload> | undefined
  await act(async () => {
    oldRequest = requestBrowserDownload('page', 'download', 'open', Date.now() + 2000)
    void oldRequest.catch(() => {})
  })
  owner.rerender({ active: false })
  await expect(oldRequest).rejects.toThrow('owner_unavailable')
  owner.rerender({ active: true })
  await act(async () => {
    nextRequest = requestBrowserDownload('page', 'download', 'open', Date.now() + 2000)
    void nextRequest.catch(() => {})
  })
  try {
    await act(async () => {
      oldComplete(true)
    })
    await expect(command('show')).rejects.toThrow('busy')
    expect(shell.openInFileManager).not.toHaveBeenCalled()
  } finally {
    await act(async () => {
      nextComplete(true)
    })
    await expect(nextRequest).resolves.toMatchObject({ accepted: true })
  }
})
