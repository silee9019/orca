import { expect, it, vi } from 'vitest'
import { RuntimeAccountController, type RuntimeAccountServices } from './runtime-account-controller'

it('starts a fixture login, exposes pending state, cancels it and fences late completion', async () => {
  const controller = new RuntimeAccountController()
  let finish: (() => void) | undefined
  const addAccount = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const cancelPendingLogin = vi.fn(() => true)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: this scenario reaches only the two login callbacks; no account snapshot or provider network call is available.
  controller.setServices({
    claudeAccounts: { addAccount, cancelPendingLogin }
  } as unknown as RuntimeAccountServices)
  expect(controller.manageLogin({ provider: 'claude', action: 'start' })).toMatchObject({
    status: 'pending'
  })
  expect(controller.manageLogin({ provider: 'claude', action: 'status' })).toMatchObject({
    status: 'pending'
  })
  expect(() => controller.manageLogin({ provider: 'claude', action: 'start' })).toThrow(
    'already pending'
  )
  expect(controller.manageLogin({ provider: 'claude', action: 'cancel' })).toMatchObject({
    status: 'cancelled'
  })
  finish?.()
  await Promise.resolve()
  expect(controller.manageLogin({ provider: 'claude', action: 'status' })).toMatchObject({
    status: 'cancelled'
  })
  expect(addAccount).toHaveBeenCalledTimes(1)
  expect(cancelPendingLogin).toHaveBeenCalledTimes(1)
})

it('reports pending browser authorization without returning the Codex login URL', () => {
  const controller = new RuntimeAccountController()
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: status reads only the fixture login URL presence; no provider mutation or credential read is available.
  controller.setServices({
    codexAccounts: {
      getPendingLoginUrl: () => 'https://auth.example.invalid/device?code=fixture-sensitive-code'
    }
  } as unknown as RuntimeAccountServices)
  const status = controller.manageLogin({ provider: 'codex', action: 'status' })
  expect(status).toEqual({ status: 'idle', browserAuthorizationPending: true })
  expect(JSON.stringify(status)).not.toContain('fixture-sensitive-code')
})
