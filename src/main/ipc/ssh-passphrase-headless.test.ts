import { afterEach, expect, it, vi } from 'vitest'
import {
  listManagedSshCredentialRequests,
  requestCredential,
  submitManagedSshCredential
} from './ssh-passphrase'
import { SSH_CREDENTIAL_TIMEOUT_MS } from '../ssh/ssh-connection-utils'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))
afterEach(() => vi.useRealTimers())
it('keeps a headless credential pending until CLI submission and removes it exactly once', async () => {
  const pending = requestCredential(() => null, 'host-a', 'password', 'private detail')
  const request = listManagedSshCredentialRequests().find((entry) => entry.targetId === 'host-a')
  expect(request).toBeDefined()
  if (!request) {
    throw new Error('missing request')
  }
  expect(JSON.stringify(request)).not.toContain('private detail')
  expect(
    submitManagedSshCredential({ requestId: request.requestId, value: 'fixture-secret' })
  ).toBe(true)
  await expect(pending).resolves.toBe('fixture-secret')
  expect(submitManagedSshCredential({ requestId: request.requestId, value: 'duplicate' })).toBe(
    false
  )
  expect(listManagedSshCredentialRequests()).toHaveLength(0)
})
it('cancels a headless credential and clears timeout and abort listeners', async () => {
  const controller = new AbortController()
  const pending = requestCredential(
    () => null,
    'host-b',
    'passphrase',
    'private detail',
    undefined,
    controller.signal
  )
  const request = listManagedSshCredentialRequests().find((entry) => entry.targetId === 'host-b')
  expect(request).toBeDefined()
  if (!request) {
    throw new Error('missing request')
  }
  expect(submitManagedSshCredential({ requestId: request.requestId, value: null })).toBe(true)
  controller.abort()
  await expect(pending).resolves.toBeNull()
  expect(listManagedSshCredentialRequests()).toHaveLength(0)
})
it('expires an unanswered headless request and clears it on abort', async () => {
  vi.useFakeTimers()
  const pending = requestCredential(() => null, 'host-c', 'password', 'private detail')
  expect(listManagedSshCredentialRequests()).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(SSH_CREDENTIAL_TIMEOUT_MS)
  await expect(pending).resolves.toBeNull()
  expect(listManagedSshCredentialRequests()).toHaveLength(0)
  const controller = new AbortController()
  const aborted = requestCredential(
    () => null,
    'host-c',
    'password',
    'private detail',
    undefined,
    controller.signal
  )
  controller.abort()
  await expect(aborted).resolves.toBeNull()
  expect(listManagedSshCredentialRequests()).toHaveLength(0)
})
