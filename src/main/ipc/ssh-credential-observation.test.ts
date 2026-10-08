import { afterEach, expect, it, vi } from 'vitest'
import type { SshCredentialObservation } from '../../shared/ssh-credential-observation'
import {
  requestCredential,
  listManagedSshCredentialRequests,
  submitManagedSshCredential
} from './ssh-passphrase'

const { publish } = vi.hoisted(() => ({
  publish: vi.fn<(value: SshCredentialObservation) => void>()
}))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))
vi.mock('./ssh-ipc-context', () => ({
  currentRuntime: { notifySshCredentialObservation: publish }
}))
afterEach(() => {
  for (const request of listManagedSshCredentialRequests()) {
    submitManagedSshCredential({ requestId: request.requestId, value: null })
  }
  publish.mockClear()
})
it('publishes the canonical pending broker snapshot and resolution without prompt or credential values', async () => {
  const pending = requestCredential(
    () => null,
    'host-a',
    'keyboard-interactive',
    'private-prompt-canary'
  )
  const [request] = listManagedSshCredentialRequests()
  expect(request).toBeDefined()
  if (!request) {
    throw new Error('missing fixture request')
  }
  expect(publish).toHaveBeenLastCalledWith({ requests: [request] })
  expect(submitManagedSshCredential({ requestId: 'wrong-id', value: 'private-value-canary' })).toBe(
    false
  )
  expect(publish).toHaveBeenCalledOnce()
  expect(
    submitManagedSshCredential({ requestId: request.requestId, value: 'private-value-canary' })
  ).toBe(true)
  await expect(pending).resolves.toBe('private-value-canary')
  expect(publish).toHaveBeenLastCalledWith({ requests: [] })
  expect(JSON.stringify(publish.mock.calls)).not.toContain('private-')
  expect(listManagedSshCredentialRequests()).toEqual([])
})
it('publishes cancellation exactly once and keeps a replacement request incarnation pending', async () => {
  const abort = new AbortController()
  const first = requestCredential(
    () => null,
    'host-a',
    'password',
    'private-first-canary',
    undefined,
    abort.signal
  )
  const [old] = listManagedSshCredentialRequests()
  abort.abort()
  await expect(first).resolves.toBeNull()
  const replacement = requestCredential(() => null, 'host-a', 'password', 'private-second-canary')
  const [current] = listManagedSshCredentialRequests()
  if (!old || !current) {
    throw new Error('missing fixture request')
  }
  expect(old.requestId).not.toBe(current.requestId)
  expect(submitManagedSshCredential({ requestId: old.requestId, value: null })).toBe(false)
  expect(listManagedSshCredentialRequests()).toEqual([current])
  submitManagedSshCredential({ requestId: current.requestId, value: null })
  await replacement
  expect(publish.mock.calls.map(([value]) => value.requests.length)).toEqual([1, 0, 1, 0])
})
