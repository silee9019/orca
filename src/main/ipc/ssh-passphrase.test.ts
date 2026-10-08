import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { listManagedSshCredentialRequests, requestCredential } from './ssh-passphrase'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  }
}))

function credentialWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() }
  } as unknown as BrowserWindow
}

describe('SSH credential requests', () => {
  it('resolves and removes the renderer prompt when its connection aborts', async () => {
    const window = credentialWindow()
    const controller = new AbortController()
    const pending = requestCredential(
      () => window,
      'target-1',
      'keyboard-interactive',
      'Duo response',
      undefined,
      controller.signal
    )
    const request = vi.mocked(window.webContents.send).mock.calls[0][1] as { requestId: string }

    controller.abort()

    await expect(pending).resolves.toBeNull()
    expect(window.webContents.send).toHaveBeenLastCalledWith('ssh:credential-resolved', {
      requestId: request.requestId
    })
  })
})

it('queries the same pending credential owner without exposing prompt detail and removes aborted requests', async () => {
  const controller = new AbortController()
  const pending = requestCredential(
    () => null,
    'fixture-query-target',
    'keyboard-interactive',
    'private-prompt-canary',
    false,
    controller.signal
  )
  const requests = listManagedSshCredentialRequests()
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    targetId: 'fixture-query-target',
    kind: 'keyboard-interactive',
    echo: false
  })
  expect(JSON.stringify(requests)).not.toContain('private-prompt-canary')
  controller.abort()
  controller.abort()
  await expect(pending).resolves.toBeNull()
  expect(listManagedSshCredentialRequests()).toEqual([])
})
