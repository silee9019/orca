// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      orcaProfileAuthStatus: { configured: true, state: 'connected' },
      connectCurrentOrcaProfile: vi.fn(),
      fetchOrcaProfileAuthStatus: vi.fn(),
      signOutCurrentOrcaProfile: mocks.signOut
    })
}))

import { OrcaAccountSettingsPane } from './OrcaAccountSettingsPane'

beforeEach(() => mocks.signOut.mockReset())
afterEach(cleanup)

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  return screen.findByRole('dialog', { name: 'Sign out of Orca?' })
}

it('closes the actual dialog through Cancel and Escape without signing out', async () => {
  render(<OrcaAccountSettingsPane />)
  const first = await openDialog()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(first).not.toBeInTheDocument())
  const second = await openDialog()
  fireEvent.keyDown(second, { key: 'Escape' })
  await waitFor(() => expect(second).not.toBeInTheDocument())
  expect(mocks.signOut).not.toHaveBeenCalled()
})

it('confirms once while busy, keeps the dialog after a failed sign-out and closes after success', async () => {
  let finish: ((result: unknown) => void) | undefined
  mocks.signOut.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  render(<OrcaAccountSettingsPane />)
  const dialog = await openDialog()
  const confirm = screen.getAllByRole('button', { name: 'Sign out' }).at(-1)
  if (!confirm) {
    throw new Error('missing confirm button')
  }
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  expect(mocks.signOut).toHaveBeenCalledOnce()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled())
  expect(confirm).toBeDisabled()
  await act(async () => finish?.(null))
  expect(dialog).toBeInTheDocument()
  expect(confirm).toBeEnabled()
  mocks.signOut.mockResolvedValueOnce({ status: 'signed-out' })
  fireEvent.click(confirm)
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
  expect(mocks.signOut).toHaveBeenCalledTimes(2)
})
