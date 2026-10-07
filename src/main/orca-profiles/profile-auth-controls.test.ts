import { expect, it, vi } from 'vitest'
import { ProfileAuthControls } from './profile-auth-controls'

const fixtures = vi.hoisted(() => ({
  connect: vi.fn(),
  status: vi.fn(() => ({ status: 'signed-out' })),
  signOut: vi.fn(async () => ({ status: 'signed-out' }))
}))
vi.mock('./profile-cloud-service', () => ({
  connectCurrentOrcaProfile: fixtures.connect,
  getCurrentOrcaProfileAuthStatus: fixtures.status,
  signOutCurrentOrcaProfile: fixtures.signOut,
  refreshCurrentOrcaProfileAuth: vi.fn(),
  selectCurrentOrcaProfileOrg: vi.fn()
}))

it('starts a fixture sign-in, cancels its signal and preserves sign-out and mutation hooks', async () => {
  const mutation = vi.fn()
  const beforeSignOut = vi.fn()
  fixtures.connect.mockImplementation(
    (_path: string, signal: AbortSignal) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true })
      })
  )
  const controls = new ProfileAuthControls({
    userDataPath: '/isolated-profile',
    onAuthMutation: mutation,
    onBeforeSignOut: beforeSignOut
  })
  expect(controls.start()).toMatchObject({ phase: 'pending' })
  expect(() => controls.start()).toThrow('already pending')
  expect(controls.cancel()).toMatchObject({ phase: 'cancelling' })
  await vi.waitFor(() =>
    expect(controls.status()).toMatchObject({ phase: 'finished', outcome: 'cancelled' })
  )
  expect(mutation).not.toHaveBeenCalled()
  await controls.signOut()
  expect(beforeSignOut).toHaveBeenCalledTimes(1)
  expect(fixtures.signOut).toHaveBeenCalledWith('/isolated-profile')
})
