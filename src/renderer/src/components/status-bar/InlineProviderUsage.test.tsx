// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { InlineUsageSignInAction } from './InlineProviderUsage'
import {
  startInlineUsageSignIn,
  readInlineUsageSignIn,
  cancelInlineUsageSignIn
} from '@/runtime/usage-inline-signin-controller'
it('reuses the mounted inline pointer and login callbacks for one account runtime', async () => {
  const target = {
    accountId: 'fixture-account',
    target: { runtime: 'host' as const, wslDistro: null }
  }
  let finish: (value: boolean) => void = () => {}
  const onSignIn = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  const onSignInPointerDown = vi.fn()
  const cancel = vi.fn(async () => true)
  Object.assign(window, { api: { codexAccounts: { cancelPendingLogin: cancel } } })
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <InlineUsageSignInAction
        isFetching={false}
        isSigningIn={false}
        disabled={false}
        viewerTarget={target}
        onSignIn={onSignIn}
        onSignInPointerDown={onSignInPointerDown}
      />
    )
  })
  const receipt = startInlineUsageSignIn(target)
  expect(onSignInPointerDown).toHaveBeenCalledOnce()
  expect(onSignIn).toHaveBeenCalledOnce()
  await cancelInlineUsageSignIn(receipt.operationId)
  expect(cancel).toHaveBeenCalledOnce()
  expect(readInlineUsageSignIn(receipt.operationId).status).toBe('pending')
  finish(true)
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  expect(readInlineUsageSignIn(receipt.operationId).status).toBe('completed')
  act(() => root.unmount())
  expect(readInlineUsageSignIn(receipt.operationId).status).toBe('unavailable')
})
