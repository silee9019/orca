// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { BrowserWebAuthnAccountDialog } from './browser-webauthn-account-dialog'
import {
  installWebAuthnDialogFixture,
  webAuthnDialogTarget as target
} from './browser-webauthn-dialog.test-fixture'
import {
  BrowserWebAuthnDialogEvent,
  requestBrowserWebAuthnDialog
} from '@/runtime/browser-webauthn-dialog-request'
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
const run = (credentialId: string | null = null, expiresAt = Date.now() + 5000) =>
  requestBrowserWebAuthnDialog({ ...target, credentialId }, expiresAt)
it.each([null, 'fixture-credential'])(
  'removes only an accepted queue head for %s through the shared owner',
  async (credentialId) => {
    const fixture = installWebAuthnDialogFixture()
    render(<BrowserWebAuthnAccountDialog />)
    fixture.push()
    fixture.push('second', 'second.invalid')
    await act(async () => {
      expect(await run(credentialId)).toMatchObject({
        accepted: true,
        removed: true,
        action: credentialId ? 'select' : 'cancel'
      })
    })
    expect(fixture.accepted).toEqual([{ requestId: 'request', credentialId }])
    expect(screen.getByText('second.invalid')).toBeInTheDocument()
  }
)
it('rejects exact identity, expired, unknown credential and canonical busy boundaries before provider execution', async () => {
  const fixture = installWebAuthnDialogFixture()
  render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  for (const delta of [
    { page: 'wrong' },
    { worktreeId: 'wrong' },
    { environmentId: 'paired' },
    { relyingPartyId: 'wrong' },
    { requestId: 'later' }
  ]) {
    await expect(
      requestBrowserWebAuthnDialog({ ...target, ...delta }, Date.now() + 5000)
    ).rejects.toThrow()
  }
  await expect(run(null, 0)).rejects.toThrow('target_changed')
  await act(async () => {
    await expect(run('unknown-fixture')).rejects.toThrow('credential_mismatch')
  })
  useAppStore.setState({ activeModal: 'add-repo' })
  await expect(run()).rejects.toThrow('target_changed')
  expect(fixture.respond).not.toHaveBeenCalled()
})
it('does not execute an offered callback after queue replacement or unmount', async () => {
  const fixture = installWebAuthnDialogFixture()
  const view = render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  const first = new BrowserWebAuthnDialogEvent(target, Date.now() + 5000)
  window.dispatchEvent(first)
  fixture.close()
  fixture.push('replacement')
  await expect(first.offers[0]()).rejects.toThrow('target_changed')
  const second = new BrowserWebAuthnDialogEvent(
    { ...target, requestId: 'replacement' },
    Date.now() + 5000
  )
  window.dispatchEvent(second)
  view.unmount()
  const cleanupCount = fixture.respond.mock.calls.length
  await expect(second.offers[0]()).rejects.toThrow('target_changed')
  expect(fixture.respond).toHaveBeenCalledTimes(cleanupCount)
  expect(fixture.listenerCount()).toBe(0)
})
it('keeps refused or failed responses in the queue and supports retry', async () => {
  const fixture = installWebAuthnDialogFixture()
  render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  fixture.respond.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('provider_failed'))
  await act(async () => {
    await expect(run()).rejects.toThrow('response_refused')
  })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await act(async () => {
    await expect(run()).rejects.toThrow('provider_failed')
  })
  await act(async () => {
    await run()
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it.each(['expire', 'unmount', 'replace'] as const)(
  'rejects asynchronous %s without releasing an in-flight response early',
  async (kind) => {
    const fixture = installWebAuthnDialogFixture()
    const view = render(<BrowserWebAuthnAccountDialog />)
    fixture.push()
    let finish: (accepted: boolean) => void = () => {}
    fixture.respond.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    let request!: Promise<unknown>
    let rejection!: Promise<unknown>
    act(() => {
      request = run(null, Date.now() + (kind === 'expire' ? 15 : 5000))
      rejection = expect(request).rejects.toThrow()
    })
    if (kind === 'unmount') {
      view.unmount()
    }
    if (kind === 'replace') {
      useAppStore.setState((state) => ({
        browserPagesByWorkspace: Object.fromEntries(
          Object.entries(state.browserPagesByWorkspace).map(([key, pages]) => [
            key,
            pages.map((page) =>
              page.id === 'page' ? { ...page, browserRuntimeEnvironmentId: 'other' } : page
            )
          ])
        )
      }))
    }
    if (kind === 'expire') {
      await rejection
      await expect(run()).rejects.toThrow('busy')
    }
    await act(async () => {
      finish(true)
      await rejection
    })
    expect(fixture.respond).toHaveBeenCalledTimes(1)
  }
)
it('claims ambiguous dialog owners before either can execute', async () => {
  const fixture = installWebAuthnDialogFixture()
  render(
    <>
      <BrowserWebAuthnAccountDialog />
      <BrowserWebAuthnAccountDialog />
    </>
  )
  fixture.push()
  await expect(run()).rejects.toThrow('ambiguous')
  expect(fixture.respond).not.toHaveBeenCalled()
})

it('uses the same cancel response when the dialog dismisses with Escape', async () => {
  const fixture = installWebAuthnDialogFixture()
  render(<BrowserWebAuthnAccountDialog />)
  fixture.push()
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  })
  expect(fixture.accepted).toEqual([{ requestId: 'request', credentialId: null }])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
