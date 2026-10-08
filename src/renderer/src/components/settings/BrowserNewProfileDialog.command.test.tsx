// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BrowserNewProfileDialog } from './BrowserNewProfileDialog'
import { requestBrowserSettings } from '@/runtime/browser-settings-request'
const fake = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ createBrowserSessionProfile: fake.create }) }
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
function Owner(): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return <BrowserNewProfileDialog open={open} onOpenChange={setOpen} />
}
async function command(value: Parameters<typeof requestBrowserSettings>[0]) {
  const pending = requestBrowserSettings(value, Date.now() + 1500)
  void pending.catch(() => {})
  await act(async () => {
    await Promise.resolve()
  })
  return pending
}
it('changes the actual dialog draft and clears it when the owner closes', async () => {
  render(<Owner />)
  expect(await command({ action: 'profile-name', value: 'Fixture Profile' })).toMatchObject({
    profileNamePresent: true,
    dialogOpen: true
  })
  expect(screen.getByRole('textbox')).toHaveProperty('value', 'Fixture Profile')
  expect(await command({ action: 'profile-dialog-close' })).toMatchObject({
    profileNamePresent: false,
    dialogOpen: false
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  await expect(command({ action: 'profile-name', value: 'closed' })).rejects.toThrow(
    'browser_settings_action_failed_effect_unknown'
  )
})
it('uses the existing submission owner, closes on success and preserves draft on failure', async () => {
  render(<Owner />)
  fake.create
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ id: 'fixture-profile', label: 'Fixture Profile' })
  await command({ action: 'profile-name', value: '  Fixture Profile  ' })
  await expect(command({ action: 'profile-create' })).rejects.toThrow(
    'browser_settings_action_failed_effect_unknown'
  )
  expect(await command({ action: 'profile-dialog-status' })).toMatchObject({
    dialogOpen: true,
    profileNamePresent: true,
    creating: false
  })
  expect(await command({ action: 'profile-create' })).toMatchObject({
    dialogOpen: false,
    profileNamePresent: false,
    creating: false
  })
  expect(fake.create).toHaveBeenNthCalledWith(1, 'isolated', 'Fixture Profile')
  expect(fake.create).toHaveBeenCalledTimes(2)
})
