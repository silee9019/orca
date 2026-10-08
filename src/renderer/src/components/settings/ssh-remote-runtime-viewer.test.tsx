// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SshPane } from './SshPane'
import { TooltipProvider } from '../ui/tooltip'
import { useAppStore } from '@/store'
import { applySshConnectionsViewerRequest } from '@/runtime/ssh-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'

async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applySshConnectionsViewerRequest({
      id: 'runtime-choice',
      expiresAt: Date.now() + 300,
      command
    })
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('uses the actual SSH form runtime choice for native and typed draft changes without saving', async () => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  const add = vi.fn()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ssh: { listTargets: vi.fn(async () => []), addTarget: add } }
  })
  render(
    <TooltipProvider>
      <SshPane />
    </TooltipProvider>
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Add Target' })).toBeInTheDocument()
  )
  await invoke({ viewerId: 7, operation: 'ssh.form-open' })
  await invoke({ viewerId: 7, operation: 'ssh.advanced', open: true })
  const runtime = screen.getByLabelText('Runtime')
  fireEvent.keyDown(runtime, { key: 'ArrowDown' })
  fireEvent.click(screen.getByRole('option', { name: 'Orca-managed Node' }))
  expect(runtime).toHaveTextContent('Orca-managed Node')
  await expect(
    invoke({ viewerId: 7, operation: 'ssh.form-draft', updates: { remoteRuntime: 'legacy' } })
  ).resolves.toMatchObject({ applied: true })
  expect(runtime).toHaveTextContent('Host Node')
  await invoke({ viewerId: 7, operation: 'ssh.form-draft', updates: { remoteRuntime: 'auto' } })
  expect(runtime).toHaveTextContent('Auto')
  expect(add).not.toHaveBeenCalled()
})
