// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import BrowserFind from './BrowserFind'
import {
  requestBrowserFind,
  type BrowserFindAction,
  type BrowserFindState
} from '@/runtime/browser-find-request'

const findInPage = vi.fn()
const stopFindInPage = vi.fn()
const guest = Object.assign(document.createElement('webview'), { findInPage, stopFindInPage })
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: BrowserFind uses only the DOM event and find members supplied by this guest double.
const ref = { current: guest as unknown as Electron.WebviewTag }
function Fixture() {
  const [open, setOpen] = useState(false)
  return (
    <BrowserFind
      browserPageId="p1"
      onOpen={() => setOpen(true)}
      isOpen={open}
      onClose={() => setOpen(false)}
      webviewRef={ref}
    />
  )
}
async function command(action: BrowserFindAction, query?: string): Promise<BrowserFindState> {
  let result: Promise<BrowserFindState> | undefined
  await act(async () => {
    result = requestBrowserFind('p1', action, Date.now() + 9000, query)
  })
  if (!result) {
    throw new Error('missing request')
  }
  return result
}
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})
it('opens the exact find UI, changes its query, advances the guest, and closes it', async () => {
  render(<Fixture />)
  expect(await command('open')).toMatchObject({ open: true, query: '' })
  expect(screen.getByPlaceholderText('Find in page...')).toBeTruthy()
  expect(await command('query', 'needle')).toMatchObject({ open: true, query: 'needle' })
  expect(await command('next')).toMatchObject({ query: 'needle' })
  expect(findInPage).toHaveBeenLastCalledWith('needle', { forward: true, findNext: true })
  await command('previous')
  expect(findInPage).toHaveBeenLastCalledWith('needle', { forward: false, findNext: false })
  act(() => {
    guest.dispatchEvent(
      Object.assign(new Event('found-in-page'), { result: { activeMatchOrdinal: 2, matches: 3 } })
    )
  })
  expect(await command('status')).toMatchObject({ activeMatch: 2, totalMatches: 3 })
  expect(await command('close')).toMatchObject({ open: false })
  expect(screen.queryByPlaceholderText('Find in page...')).toBeNull()
  expect(stopFindInPage).toHaveBeenCalledWith('clearSelection')
})
it('refuses a missing page UI, expired action, and next when closed', async () => {
  await expect(requestBrowserFind('missing', 'open', Date.now() + 9000)).rejects.toThrow(
    'browser_find_ui_unavailable'
  )
  render(<Fixture />)
  await expect(requestBrowserFind('p1', 'open', Date.now() - 1)).rejects.toThrow('request_expired')
  await expect(requestBrowserFind('p1', 'next', Date.now() + 9000)).rejects.toThrow(
    'browser_find_not_open'
  )
  expect(findInPage).not.toHaveBeenCalled()
})

it('rejects oversized UTF-8 queries and unavailable guest commands without reporting success', async () => {
  render(<Fixture />)
  await expect(
    requestBrowserFind('p1', 'query', Date.now() + 9000, '한'.repeat(800))
  ).rejects.toThrow('invalid_find_query')
  await command('query', 'needle')
  findInPage.mockImplementationOnce(() => {
    throw new Error('guest destroyed')
  })
  await expect(requestBrowserFind('p1', 'next', Date.now() + 9000)).rejects.toThrow(
    'browser_find_guest_unavailable'
  )
})

it('rejects a native find UI commit after deadline without waiting for the timeout task', async () => {
  render(<Fixture />)
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  let pending: Promise<BrowserFindState> | undefined
  try {
    await act(async () => {
      pending = requestBrowserFind('p1', 'open', now + 1000)
      void pending.catch(() => {})
      clock.mockReturnValue(now + 1001)
    })
    await expect(pending).rejects.toThrow('request_expired')
  } finally {
    clock.mockRestore()
  }
})
