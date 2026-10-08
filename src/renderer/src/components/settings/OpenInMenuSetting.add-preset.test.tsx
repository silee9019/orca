// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { getOpenInAppPresets } from '@/lib/open-in-app-catalog'
import { OPEN_IN_APPLICATIONS_MAX } from '../../../../shared/open-in-applications'
import { createPresetOpenInApplication, OpenInMenuSetting } from './OpenInMenuSetting'

afterEach(cleanup)

const preset = getOpenInAppPresets().find((entry) => entry.id === 'cursor')

it('writes the exact catalog row when a preset is chosen from the actual Add app menu', async () => {
  if (!preset) {
    throw new Error('missing cursor preset')
  }
  const updateSettings = vi.fn()
  const user = userEvent.setup()
  render(<OpenInMenuSetting applications={[]} updateSettings={updateSettings} />)
  await user.click(screen.getByRole('button', { name: 'Add app' }))
  await user.click(await screen.findByRole('menuitem', { name: preset.label }))
  expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
    openInApplications: [createPresetOpenInApplication(preset)]
  })
})

it('does not write a duplicate preset or exceed the application limit', async () => {
  if (!preset) {
    throw new Error('missing cursor preset')
  }
  const updateSettings = vi.fn()
  const user = userEvent.setup()
  const { unmount } = render(
    <OpenInMenuSetting
      applications={[createPresetOpenInApplication(preset)]}
      updateSettings={updateSettings}
    />
  )
  await user.click(screen.getByRole('button', { name: 'Add app' }))
  const item = await screen.findByRole('menuitem', { name: new RegExp(preset.label) })
  expect(item).toHaveAttribute('aria-disabled', 'true')
  await user.click(item)
  unmount()
  const full = Array.from({ length: OPEN_IN_APPLICATIONS_MAX }, (_, index) => ({
    id: `app-${index}`,
    label: `App ${index}`,
    command: `app-${index}`
  }))
  render(<OpenInMenuSetting applications={full} updateSettings={updateSettings} />)
  expect(screen.getByRole('button', { name: 'Add app' })).toBeDisabled()
  expect(updateSettings).not.toHaveBeenCalled()
})
