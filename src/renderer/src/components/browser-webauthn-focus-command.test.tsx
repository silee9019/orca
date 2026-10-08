// @vitest-environment happy-dom
import { requestBrowserWebAuthnDialog } from '@/runtime/browser-webauthn-dialog-request'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { BrowserWebAuthnAccountDialog } from './browser-webauthn-account-dialog'
import {
  installWebAuthnDialogFixture,
  webAuthnDialogTarget
} from './browser-webauthn-dialog.test-fixture'
import {
  BrowserWebAuthnFocusEvent,
  requestBrowserWebAuthnFocus
} from '@/runtime/browser-webauthn-focus-request'
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.restoreAllMocks()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('focuses the exact first account through the real dialog owner without responding', async () => {
  const fixture = installWebAuthnDialogFixture()
  render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  await act(async () => {})
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fixture Account' }))
  const cancel = screen.getByRole('button', { name: 'Cancel' })
  cancel.focus()
  await act(async () => {
    expect(
      await requestBrowserWebAuthnFocus(
        { ...webAuthnDialogTarget, accountId: 'fixture-credential' },
        Date.now() + 5000
      )
    ).toMatchObject({ focused: true, accountIndex: 0 })
  })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fixture Account' }))
  expect(fixture.respond).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).not.toBeNull()
})
it.each([false, true])(
  'preserves exact page/client identity and first-account DOM binding client=%s',
  async (client) => {
    const fixture = installWebAuthnDialogFixture(client)
    render(<BrowserWebAuthnAccountDialog />)
    fixture.push()
    const command = {
      ...webAuthnDialogTarget,
      accountId: 'fixture-credential',
      environmentId: client ? 'environment' : null,
      ...(client
        ? {
            clientTarget: {
              remotePageId: 'remote-page',
              browserHostClientId: 'fixture',
              browserHostGeneration: 3,
              pageHostGeneration: 7
            }
          }
        : {})
    }
    screen.getByRole('button', { name: 'Cancel' }).focus()
    await expect(requestBrowserWebAuthnFocus(command, Date.now() + 5000)).resolves.toMatchObject({
      focused: true
    })
    for (const delta of [
      { accountId: 'wrong' },
      { page: 'wrong' },
      { worktreeId: 'wrong' },
      { relyingPartyId: 'wrong' }
    ]) {
      screen.getByRole('button', { name: 'Cancel' }).focus()
      await expect(
        requestBrowserWebAuthnFocus({ ...command, ...delta }, Date.now() + 5000)
      ).rejects.toThrow()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    }
    if (client) {
      await expect(
        requestBrowserWebAuthnFocus(
          {
            ...command,
            clientTarget: {
              remotePageId: 'remote-page',
              browserHostClientId: 'fixture',
              browserHostGeneration: 3,
              pageHostGeneration: 8
            }
          },
          Date.now() + 5000
        )
      ).rejects.toThrow('target_changed')
    }
    expect(fixture.respond).not.toHaveBeenCalled()
  }
)
it('refuses expiration, modal and a disabled DOM account without provider execution', async () => {
  const fixture = installWebAuthnDialogFixture()
  render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  const target = { ...webAuthnDialogTarget, accountId: 'fixture-credential' }
  await expect(requestBrowserWebAuthnFocus(target, 0)).rejects.toThrow('target_changed')
  useAppStore.setState({ activeModal: 'add-repo' })
  await expect(requestBrowserWebAuthnFocus(target, Date.now() + 5000)).rejects.toThrow(
    'target_changed'
  )
  useAppStore.setState({ activeModal: 'none' })
  screen.getByRole('button', { name: 'Fixture Account' }).setAttribute('disabled', '')
  await expect(requestBrowserWebAuthnFocus(target, Date.now() + 5000)).rejects.toThrow(
    'effect_unknown'
  )
  expect(fixture.respond).not.toHaveBeenCalled()
})
it('rejects a stale queue offer and its unmounted owner', async () => {
  const fixture = installWebAuthnDialogFixture()
  const view = render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  const target = { ...webAuthnDialogTarget, accountId: 'fixture-credential' }
  const event = new BrowserWebAuthnFocusEvent(target, Date.now() + 5000)
  window.dispatchEvent(event)
  fixture.close()
  fixture.push('replacement')
  await expect(event.offers[0]()).rejects.toThrow('target_changed')
  const next = new BrowserWebAuthnFocusEvent(
    { ...target, requestId: 'replacement' },
    Date.now() + 5000
  )
  window.dispatchEvent(next)
  view.unmount()
  const count = fixture.respond.mock.calls.length
  await expect(next.offers[0]()).rejects.toThrow('target_changed')
  expect(fixture.respond).toHaveBeenCalledTimes(count)
  expect(fixture.listenerCount()).toBe(0)
})
it('refuses focus while the same actual queue owner is responding', async () => {
  const fixture = installWebAuthnDialogFixture()
  render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  let finish = () => {}
  const gate = new Promise<boolean>((resolve) => {
    finish = () => resolve(false)
  })
  fixture.respond.mockReturnValue(gate)
  let pending: ReturnType<typeof requestBrowserWebAuthnDialog> | undefined
  await act(async () => {
    pending = requestBrowserWebAuthnDialog(webAuthnDialogTarget, Date.now() + 5000)
    void pending.catch(() => {})
  })
  await expect(
    requestBrowserWebAuthnFocus(
      { ...webAuthnDialogTarget, accountId: 'fixture-credential' },
      Date.now() + 5000
    )
  ).rejects.toThrow('busy')
  await act(async () => {
    finish()
    await gate
  })
  await expect(pending).rejects.toThrow('response_refused')
})
