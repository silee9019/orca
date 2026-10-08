// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SshPassphraseDialog } from './SshPassphraseDialog'
import { useAppStore } from '@/store'
import { applySshCredentialViewerRequest } from '@/runtime/ssh-credential-viewer'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'
const submit = vi.fn()
const current = {
  requestId: 'request-a',
  targetId: 'host-a',
  kind: 'password' as const,
  detail: 'private-challenge-canary'
}
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applySshCredentialViewerRequest> | undefined
  await act(async () => {
    pending = applySshCredentialViewerRequest({
      id: 'credential-test',
      expiresAt: Date.now() + 500,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
const target = { viewerId: 7, requestId: current.requestId, targetId: current.targetId }
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.getState().enqueueSshCredentialRequest(current)
  submit.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ssh: { submitCredential: submit } }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('shares the native credential input and submit owner without returning secret text', async () => {
  render(<SshPassphraseDialog />)
  fireEvent.change(screen.getByLabelText(/Password for/), {
    target: { value: 'private-native-canary' }
  })
  fireEvent.keyDown(screen.getByLabelText(/Password for/), { key: 'Enter' })
  await waitFor(() =>
    expect(submit).toHaveBeenCalledExactlyOnceWith({
      requestId: current.requestId,
      value: 'private-native-canary'
    })
  )
  await act(async () => {
    useAppStore.getState().enqueueSshCredentialRequest(current)
  })
  const draft = await invoke({
    ...target,
    operation: 'ssh-credential.draft',
    value: 'private-typed-canary'
  })
  expect(draft).toMatchObject({ applied: true, state: { open: true, configured: true } })
  expect(screen.getByLabelText(/Password for/)).toHaveValue('private-typed-canary')
  const result = await invoke({
    ...target,
    operation: 'ssh-credential.submit',
    value: 'private-typed-canary',
    confirmTarget: current.requestId
  })
  expect(result).toMatchObject({ applied: true, persisted: null })
  expect(submit).toHaveBeenLastCalledWith({
    requestId: current.requestId,
    value: 'private-typed-canary'
  })
  expect(useAppStore.getState().sshCredentialQueue).toEqual([])
  expect(JSON.stringify([draft, result])).not.toContain('private-')
})
it('requires the exact prompt and current draft and shares native and typed cancellation', async () => {
  render(<SshPassphraseDialog />)
  await expect(
    invoke({ ...target, requestId: 'wrong', operation: 'ssh-credential.get' })
  ).rejects.toThrow('connections_surface_unavailable')
  await invoke({ ...target, operation: 'ssh-credential.draft', value: 'private-current-canary' })
  await expect(
    invoke({
      ...target,
      operation: 'ssh-credential.submit',
      value: 'private-stale-canary',
      confirmTarget: current.requestId
    })
  ).resolves.toMatchObject({ applied: false })
  await expect(
    invoke({ ...target, operation: 'ssh-credential.cancel', confirmTarget: 'wrong' })
  ).rejects.toThrow('confirm_target_mismatch')
  expect(submit).not.toHaveBeenCalled()
  await expect(
    invoke({ ...target, operation: 'ssh-credential.cancel', confirmTarget: current.requestId })
  ).resolves.toMatchObject({ applied: true })
  expect(submit).toHaveBeenCalledExactlyOnceWith({ requestId: current.requestId, value: null })
  await act(async () => {
    useAppStore.getState().enqueueSshCredentialRequest(current)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
})
it('preserves empty keyboard-interactive answers and rejects empty passwords', async () => {
  render(<SshPassphraseDialog />)
  await expect(
    invoke({
      ...target,
      operation: 'ssh-credential.submit',
      value: '',
      confirmTarget: current.requestId
    })
  ).resolves.toMatchObject({ applied: false })
  expect(submit).not.toHaveBeenCalled()
  await act(async () => {
    useAppStore.setState({ sshCredentialQueue: [{ ...current, kind: 'keyboard-interactive' }] })
  })
  await expect(
    invoke({
      ...target,
      operation: 'ssh-credential.submit',
      value: '',
      confirmTarget: current.requestId
    })
  ).resolves.toMatchObject({ applied: true })
  expect(submit).toHaveBeenCalledExactlyOnceWith({ requestId: current.requestId, value: '' })
})
it('blocks duplicate native/typed submissions and late effects after unmount', async () => {
  let resolve: (() => void) | undefined
  submit.mockImplementation(
    () =>
      new Promise<void>((done) => {
        resolve = done
      })
  )
  const mounted = render(<SshPassphraseDialog />)
  await invoke({ ...target, operation: 'ssh-credential.draft', value: 'private-busy-canary' })
  let pending: Promise<unknown> | undefined
  await act(async () => {
    pending = applySshCredentialViewerRequest({
      id: 'busy',
      expiresAt: Date.now() + 500,
      command: {
        ...target,
        operation: 'ssh-credential.submit',
        value: 'private-busy-canary',
        confirmTarget: current.requestId
      }
    })
    void pending.catch(() => {})
    fireEvent.keyDown(screen.getByLabelText(/Password for/), { key: 'Enter' })
  })
  expect(submit).toHaveBeenCalledOnce()
  mounted.unmount()
  await act(async () => {
    resolve?.()
    await pending
  })
  await expect(pending).resolves.toMatchObject({ applied: false })
  expect(useAppStore.getState().sshCredentialQueue).toEqual([current])
})
it('rejects a prompt replaced before React commits and preserves its next prompt', async () => {
  render(<SshPassphraseDialog />)
  await invoke({ ...target, operation: 'ssh-credential.draft', value: 'private-old-canary' })
  const input = screen.getByLabelText(/Password for/)
  const next = { ...current, requestId: 'request-b' }
  await act(async () => {
    useAppStore.setState({ sshCredentialQueue: [next] })
    fireEvent.keyDown(input, { key: 'Enter' })
    await expect(
      applySshCredentialViewerRequest({
        id: 'stale',
        expiresAt: Date.now() + 500,
        command: { ...target, operation: 'ssh-credential.draft', value: 'private-stale-canary' }
      })
    ).rejects.toThrow('connections_surface_unavailable')
  })
  expect(submit).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/Password for/)).toHaveValue('')
  expect(useAppStore.getState().sshCredentialQueue).toEqual([next])
})
