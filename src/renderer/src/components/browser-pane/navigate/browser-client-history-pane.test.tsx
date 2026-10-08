// @vitest-environment happy-dom
import { act } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { fixture, guest, target, mount } from './browser-client-command.test-fixture'
import { requestBrowserClientHistory } from '@/runtime/browser-client-history-request'
import { useAppStore } from '@/store'
it('uses the actual ClientPane navigation owner and fake retained guest history with store readback', async () => {
  let index = 1
  const urls = ['https://first.test/', 'https://second.test/']
  Object.assign(guest, {
    getURL: () => urls[index],
    canGoBack: () => index > 0,
    canGoForward: () => index < 1,
    goBack: vi.fn(() => {
      index -= 1
      guest.dispatchEvent(Object.assign(new Event('did-navigate'), { url: urls[index] }))
    }),
    goForward: vi.fn(() => {
      index += 1
      guest.dispatchEvent(Object.assign(new Event('did-navigate'), { url: urls[index] }))
    })
  })
  mount()
  await act(async () => {
    await expect(
      requestBrowserClientHistory(
        { viewer: 'host', operation: 'client-history', target, action: 'back' },
        Date.now() + 2000
      )
    ).resolves.toMatchObject({ accepted: true, completionObserved: false, observedUrl: urls[0] })
  })
  expect(index).toBe(0)
  expect(
    Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === target.page)?.url
  ).toBe(urls[0])
  await act(async () => {
    await requestBrowserClientHistory(
      { viewer: 'host', operation: 'client-history', target, action: 'forward' },
      Date.now() + 2000
    )
  })
  expect(index).toBe(1)
  expect(fixture.publish).toHaveBeenCalled()
})
