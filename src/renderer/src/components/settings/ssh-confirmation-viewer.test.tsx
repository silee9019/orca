// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SshTargetDestructiveActions } from './SshTargetDestructiveActions'
import { applySshConfirmationViewerRequest } from '@/runtime/ssh-confirmation-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
afterEach(cleanup)
async function invoke(command: ConnectionsViewerCommand) {
  let pending
  await act(async () => {
    pending = applySshConfirmationViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 500,
      command
    })
    void pending.catch(() => {})
  })
  return pending
}
function fixture() {
  const reset = vi.fn().mockResolvedValue(true)
  const terminate = vi.fn().mockResolvedValue({ terminated: 0, unverifiable: 2 })
  render(
    <SshTargetDestructiveActions
      targets={[{ id: 'host-a', label: 'Host A' }]}
      connectionStates={new Map()}
      onRemove={vi.fn()}
      onResetRelay={reset}
      onTerminateSessions={terminate}
    >
      {() => null}
    </SshTargetDestructiveActions>
  )
  return { reset, terminate }
}
it('requests and confirms the actual terminate dialog with exact target and retains unverifiable counts', async () => {
  const f = fixture()
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.request',
      kind: 'terminate',
      targetId: 'host-a'
    })
  ).toMatchObject({ applied: true, state: { terminateTargetId: 'host-a' } })
  expect(screen.getByRole('dialog')).toHaveTextContent('End Remote Terminals?')
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.confirm',
      kind: 'terminate',
      confirmTarget: 'host-b'
    })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(f.terminate).not.toHaveBeenCalled()
  const result = await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.confirm',
    kind: 'terminate',
    confirmTarget: 'host-a'
  })
  expect(result).toMatchObject({
    applied: true,
    persisted: null,
    termination: { terminated: 0, unverifiable: 2 },
    state: { terminateTargetId: null, busy: false }
  })
  expect(f.terminate).toHaveBeenCalledExactlyOnceWith('host-a')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('cancels the existing reset dialog without calling its owner and rejects missing targets', async () => {
  const f = fixture()
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.request',
      kind: 'reset',
      targetId: 'missing'
    })
  ).rejects.toThrow('ssh_target_unavailable')
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'reset',
    targetId: 'host-a'
  })
  expect(screen.getByRole('dialog')).toHaveTextContent('Reset Remote Relay?')
  expect(
    (await invoke({ viewerId: 7, operation: 'ssh-confirmation.cancel', kind: 'reset' })).applied
  ).toBe(true)
  expect(f.reset).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('does not acknowledge a failed owner action as applied', async () => {
  const f = fixture()
  f.reset.mockResolvedValue(false)
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'reset',
    targetId: 'host-a'
  })
  expect(
    await invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.confirm',
      kind: 'reset',
      confirmTarget: 'host-a'
    })
  ).toMatchObject({ applied: false, reason: 'ssh_action_failed', state: { resetTargetId: null } })
})
it('keeps the dialog busy until the actual owner finishes and blocks overlapping cancellation', async () => {
  const f = fixture()
  let finish: (() => void) | undefined
  f.reset.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = () => resolve(true)
      })
  )
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'reset',
    targetId: 'host-a'
  })
  let confirming: ReturnType<typeof applySshConfirmationViewerRequest> | undefined
  await act(async () => {
    confirming = applySshConfirmationViewerRequest({
      id: 'busy',
      expiresAt: Date.now() + 1000,
      command: {
        viewerId: 7,
        operation: 'ssh-confirmation.confirm',
        kind: 'reset',
        confirmTarget: 'host-a'
      }
    })
  })
  await expect(
    invoke({ viewerId: 7, operation: 'ssh-confirmation.cancel', kind: 'reset' })
  ).rejects.toThrow('ssh_action_in_progress')
  expect(screen.getByRole('button', { name: 'Resetting' })).toBeDisabled()
  await act(async () => {
    finish?.()
  })
  expect(await confirming).toMatchObject({
    applied: true,
    state: { resetTargetId: null, busy: false }
  })
  expect(f.reset).toHaveBeenCalledTimes(1)
})

it('does not open a second destructive dialog over the existing confirmation', async () => {
  const f = fixture()
  await invoke({
    viewerId: 7,
    operation: 'ssh-confirmation.request',
    kind: 'reset',
    targetId: 'host-a'
  })
  await expect(
    invoke({
      viewerId: 7,
      operation: 'ssh-confirmation.request',
      kind: 'terminate',
      targetId: 'host-a'
    })
  ).rejects.toThrow('ssh_confirmation_in_progress')
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(f.terminate).not.toHaveBeenCalled()
})
