import { describe, expect, it, vi } from 'vitest'
import {
  registerFeatureWallUsageAccounts,
  startFeatureWallUsageSignIn,
  readFeatureWallUsageSignIn,
  cancelFeatureWallUsageSignIn,
  registerUsageAccountStateRefresh,
  refreshUsageAccountStateViaViewer
} from './usage-account-viewer-controller'

describe('feature wall sign-in lifecycle', () => {
  it('returns pending, preserves busy and cancellation until the original callback completes', async () => {
    let finish: (value: boolean) => void = () => {}
    const signIn = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    const cancel = vi.fn(async () => true)
    const cleanup = registerFeatureWallUsageAccounts('claude', {
      signIn,
      cancel,
      busy: () => false
    })
    const receipt = startFeatureWallUsageSignIn('claude')
    expect(receipt.status).toBe('pending')
    expect(() => startFeatureWallUsageSignIn('claude')).toThrow('usage_signin_busy')
    expect((await cancelFeatureWallUsageSignIn('claude', receipt.operationId)).status).toBe(
      'pending'
    )
    expect(cancel).toHaveBeenCalledOnce()
    finish(true)
    await Promise.resolve()
    expect(readFeatureWallUsageSignIn('claude', receipt.operationId).status).toBe('completed')
    cleanup()
    expect(readFeatureWallUsageSignIn('claude', receipt.operationId).status).toBe('unavailable')
  })
  it('does not claim completion after unmount or leak callback errors', async () => {
    let fail: (error: Error) => void = () => {}
    const cleanup = registerFeatureWallUsageAccounts('codex', {
      signIn: () =>
        new Promise<boolean>((_, reject) => {
          fail = reject
        }),
      cancel: async () => false,
      busy: () => false
    })
    const receipt = startFeatureWallUsageSignIn('codex')
    cleanup()
    fail(new Error('secret-provider-url'))
    await Promise.resolve()
    expect(readFeatureWallUsageSignIn('codex', receipt.operationId)).toEqual({
      ...receipt,
      status: 'unavailable'
    })
  })
})

it('retains the exact pending owner when another copy mounts and unmounts', async () => {
  let finish: (value: boolean) => void = () => {}
  const remove = registerFeatureWallUsageAccounts('claude', {
    busy: () => false,
    cancel: async () => true,
    signIn: () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  })
  const receipt = startFeatureWallUsageSignIn('claude')
  const removeOther = registerFeatureWallUsageAccounts('claude', {
    busy: () => false,
    cancel: async () => false,
    signIn: async () => false
  })
  expect(() => startFeatureWallUsageSignIn('claude')).toThrow('ambiguous')
  removeOther()
  expect(readFeatureWallUsageSignIn('claude', receipt.operationId).status).toBe('pending')
  finish(true)
  await Promise.resolve()
  expect(readFeatureWallUsageSignIn('claude', receipt.operationId).status).toBe('completed')
  remove()
})
it('gives identical refresh callbacks separate mounted ownership', async () => {
  const callback = vi.fn(async () => {})
  const remove = registerUsageAccountStateRefresh(callback)
  const removeOther = registerUsageAccountStateRefresh(callback)
  await expect(refreshUsageAccountStateViaViewer()).rejects.toThrow('ambiguous')
  removeOther()
  expect(await refreshUsageAccountStateViaViewer()).toEqual({ callbackCompleted: true })
  expect(callback).toHaveBeenCalledOnce()
  remove()
})
