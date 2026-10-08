// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SshPane } from './SshPane'
import { TooltipProvider } from '../ui/tooltip'
import { useAppStore } from '@/store'
import { applySshConnectionsViewerRequest } from '@/runtime/ssh-connections-viewer-controller'
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('keeps a dirty SSH form on outside interaction and preserves explicit native/typed discard', async () => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({ recordFeatureInteraction: vi.fn() })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ssh: { listTargets: vi.fn().mockResolvedValue([]) } }
  })
  render(
    <TooltipProvider>
      <SshPane />
    </TooltipProvider>
  )
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add Target' })).toBeVisible())
  fireEvent.click(screen.getByRole('button', { name: 'Add Target' }))
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1))
  })
  const host = document.querySelector('#ssh-target-host')
  if (!host) {
    throw new Error('missing_host_input')
  }
  fireEvent.change(host, { target: { value: 'private-dirty-host-canary' } })
  fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 })
  fireEvent.click(document.body)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(host).toHaveValue('private-dirty-host-canary')
  let pending: ReturnType<typeof applySshConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applySshConnectionsViewerRequest({
      id: 'cancel-dirty',
      expiresAt: Date.now() + 500,
      command: { viewerId: 7, operation: 'ssh.form-cancel' }
    })
  })
  await expect(pending).resolves.toMatchObject({ applied: true, state: { formOpen: false } })
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add Target' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
