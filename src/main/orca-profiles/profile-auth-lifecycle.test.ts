import { afterEach, expect, it, vi } from 'vitest'
import { ProfileAuthControls } from './profile-auth-controls'

const fixture = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock('./profile-cloud-service', () => ({
  connectCurrentOrcaProfile: fixture.connect,
  getCurrentOrcaProfileAuthStatus: () => ({ status: 'signed-out' }),
  signOutCurrentOrcaProfile: vi.fn(),
  refreshCurrentOrcaProfileAuth: vi.fn(),
  selectCurrentOrcaProfileOrg: vi.fn()
}))
afterEach(() => vi.clearAllMocks())

it.each(['connected', 'failed', 'unconfigured'] as const)(
  'finishes %s without duplicating mutation and restarts after a cancelled attempt',
  async (status) => {
    const first = Promise.withResolvers<{ status: 'cancelled' }>()
    const second = Promise.withResolvers<{ status: typeof status }>()
    fixture.connect.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const mutation = vi.fn()
    const controls = new ProfileAuthControls({ userDataPath: '/fixture', onAuthMutation: mutation })
    controls.start()
    expect(controls.cancel()).toMatchObject({ phase: 'cancelling' })
    expect(() => controls.start()).toThrow('already pending')
    first.resolve({ status: 'cancelled' })
    await vi.waitFor(() =>
      expect(controls.status()).toMatchObject({ phase: 'finished', outcome: 'cancelled' })
    )
    expect(mutation).not.toHaveBeenCalled()
    expect(controls.start()).toMatchObject({ phase: 'pending', outcome: null })
    second.resolve({ status })
    await vi.waitFor(() =>
      expect(controls.status()).toMatchObject({ phase: 'finished', outcome: status })
    )
    expect(mutation).toHaveBeenCalledTimes(status === 'connected' ? 1 : 0)
    expect(fixture.connect).toHaveBeenCalledTimes(2)
  }
)

it('hides a rejected authorization error and permits a subsequent attempt', async () => {
  fixture.connect
    .mockRejectedValueOnce(new Error('fixture-private-device-code'))
    .mockResolvedValueOnce({ status: 'connected' })
  const mutation = vi.fn()
  const controls = new ProfileAuthControls({ userDataPath: '/fixture', onAuthMutation: mutation })
  controls.start()
  await vi.waitFor(() =>
    expect(controls.status()).toMatchObject({ phase: 'finished', outcome: 'failed' })
  )
  expect(JSON.stringify(controls.status())).not.toContain('fixture-private-device-code')
  controls.start()
  await vi.waitFor(() =>
    expect(controls.status()).toMatchObject({ phase: 'finished', outcome: 'connected' })
  )
  expect(mutation).toHaveBeenCalledTimes(1)
})
