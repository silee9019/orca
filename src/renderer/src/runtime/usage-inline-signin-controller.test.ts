import { describe, expect, it, vi } from 'vitest'
import {
  registerInlineUsageSignIn,
  startInlineUsageSignIn,
  readInlineUsageSignIn,
  cancelInlineUsageSignIn
} from './usage-inline-signin-controller'
import { registerUsageRosterSignIn, applyUsageRosterSignIn } from './usage-roster-viewer-controller'
it('matches an exact inline target and waits for failure after cancellation', async () => {
  const target = {
    accountId: 'fixture-account',
    target: { runtime: 'host' as const, wslDistro: null }
  }
  let finish: (value: boolean) => void = () => {}
  const pointerDown = vi.fn()
  const remove = registerInlineUsageSignIn({
    ...target,
    pointerDown,
    busy: () => false,
    cancel: async () => true,
    signIn: () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  })
  expect(() => startInlineUsageSignIn({ ...target, accountId: 'other' })).toThrow('unavailable')
  const receipt = startInlineUsageSignIn(target)
  expect(pointerDown).toHaveBeenCalledOnce()
  expect(() => startInlineUsageSignIn(target)).toThrow('busy')
  expect(await cancelInlineUsageSignIn(receipt.operationId)).toEqual({
    ...receipt,
    cancelRequested: true
  })
  finish(false)
  await Promise.resolve()
  expect(readInlineUsageSignIn(receipt.operationId).status).toBe('failed')
  remove()
  expect(readInlineUsageSignIn(receipt.operationId).status).toBe('unavailable')
})
describe('mounted roster sign-in navigation', () => {
  it('calls only an available provider and fails after unmount', () => {
    const onSignIn = vi.fn()
    const remove = registerUsageRosterSignIn({
      onSignIn,
      canSignIn: () => true,
      providers: () => ['claude']
    })
    expect(() => applyUsageRosterSignIn('codex')).toThrow('unavailable')
    expect(applyUsageRosterSignIn('claude')).toEqual({
      provider: 'claude',
      navigationRequested: true
    })
    expect(onSignIn).toHaveBeenCalledWith('claude')
    remove()
    expect(() => applyUsageRosterSignIn('claude')).toThrow('unavailable')
  })
})

it('allows duplicate roster mounts and keeps the remaining registration after one unmount', () => {
  const onSignIn = vi.fn()
  const first = registerUsageRosterSignIn({
    onSignIn,
    canSignIn: () => true,
    providers: () => ['claude']
  })
  const second = registerUsageRosterSignIn({
    onSignIn,
    canSignIn: () => true,
    providers: () => ['claude']
  })
  expect(() => applyUsageRosterSignIn('claude')).toThrow('ambiguous')
  second()
  expect(applyUsageRosterSignIn('claude')).toEqual({
    provider: 'claude',
    navigationRequested: true
  })
  first()
})
