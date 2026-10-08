// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { navigateBrowserPageToUrl } from './navigate-browser-page-url'
import { BrowserFailureFixtureOwner } from './browser-failure-owner.test-fixture'
import { BROWSER_GUEST_RECOVERY_ERROR_CODE } from '../host-guest/browser-page-guest-recovery'
import { BrowserLoadFailureOverlay } from './browser-load-failure-overlay'
import { requestBrowserFailure, BrowserFailureEvent } from '@/runtime/browser-failure-request'
import { useAppStore } from '@/store'
import type { BrowserFailureTarget } from '../../../../../shared/rpc-contract/browser-failure-params'
import type { BrowserCertificateProceedResult } from '../../../../../shared/browser-workspace-types'
import { getDefaultSettings } from '../../../../../shared/constants'
const initial = useAppStore.getInitialState()
const api = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  vi.useRealTimers()
  if (api) {
    Object.defineProperty(window, 'api', api)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function seed() {
  const url = 'https://localhost:3443/'
  const loadError = { code: -202, description: 'ERR_CERT_AUTHORITY_INVALID', validatedUrl: url }
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    activeWorktreeId: 'folder:fixture',
    persistedUIReady: true
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { set: async () => {} } }
  })
  useAppStore.getState().createBrowserTab('folder:fixture', url, { browserPageId: 'page' })
  useAppStore.getState().updateBrowserPageState('page', { loadError })
  const provider: { clipboard: string; external: string[]; approved: string[] } = {
    clipboard: '',
    external: [],
    approved: []
  }
  const props = {
    commandOwner: {
      page: 'page',
      worktreeId: 'folder:fixture',
      placement: 'local' as const,
      environmentId: null
    },
    loadError,
    currentUrl: url,
    externalUrl: url,
    httpsRecoveryUrl: null,
    expectedBrowserPageId: 'page',
    certificateFailure: {
      challengeId: 'challenge',
      browserPageId: 'page',
      errorCode: -202,
      error: 'ERR_CERT_AUTHORITY_INVALID',
      origin: 'https://localhost:3443',
      displayHost: 'localhost:3443',
      canProceed: true,
      observedAt: 0
    },
    onRetry: () => {},
    onTryHttps: () => {},
    onCopy: vi.fn(async (value: string) => {
      provider.clipboard = value
    }),
    onOpenExternal: vi.fn(async (value: string) => {
      provider.external.push(value)
    }),
    onProceedCertificate: vi.fn(async (value: string): Promise<BrowserCertificateProceedResult> => {
      provider.approved.push(value)
      return { ok: true }
    })
  }
  const command: BrowserFailureTarget = {
    worktreeId: 'folder:fixture',
    placement: 'local',
    environmentId: null,
    expectedUrl: url,
    errorCode: -202,
    action: 'copy-address'
  }
  const view = render(<BrowserLoadFailureOverlay {...props} />)
  const run = (
    action: BrowserFailureTarget['action'] = 'copy-address',
    changes: Partial<BrowserFailureTarget> = {},
    expiresAt = Date.now() + 5000
  ) =>
    requestBrowserFailure(
      'page',
      {
        ...command,
        action,
        ...(action === 'certificate-proceed' ? { challengeId: 'challenge' } : {}),
        ...changes
      },
      expiresAt
    )
  return { props, view, provider, command, run }
}
it.each(['copy-address', 'open-external', 'certificate-proceed'] as const)(
  'reuses the actual mounted failure owner for %s and reads provider acceptance',
  async (action) => {
    const fixture = seed()
    await act(async () => {
      expect(await fixture.run(action)).toMatchObject({ action, accepted: true })
    })
    if (action === 'copy-address') {
      expect(fixture.provider.clipboard).toBe(fixture.props.currentUrl)
    }
    if (action === 'open-external') {
      expect(fixture.provider.external).toEqual([fixture.props.externalUrl])
    }
    if (action === 'certificate-proceed') {
      expect(fixture.provider.approved).toEqual(['challenge'])
      expect(screen.getByRole('button', { name: 'Copy Address' }).hasAttribute('disabled')).toBe(
        true
      )
    }
  }
)
it('rejects exact target, error, challenge, busy, expiry and duplicate owner mismatches before provider effects', async () => {
  const { run, view, props, provider } = seed()
  for (const changes of [
    { expectedUrl: 'https://wrong.test/' },
    { errorCode: -105 },
    { worktreeId: 'other' },
    { placement: 'client-hosted' as const, environmentId: 'other' }
  ]) {
    await expect(run('copy-address', changes)).rejects.toThrow('owner_changed')
  }
  await expect(run('certificate-proceed', { challengeId: 'stale' })).rejects.toThrow(
    'challenge_mismatch'
  )
  await expect(run('copy-address', {}, 0)).rejects.toThrow('owner_changed')
  act(() => useAppStore.getState().openModal('add-repo'))
  await expect(run()).rejects.toThrow('busy')
  act(() => useAppStore.getState().closeModal())
  view.rerender(
    <>
      <BrowserLoadFailureOverlay {...props} />
      <BrowserLoadFailureOverlay {...props} />
    </>
  )
  await expect(run()).rejects.toThrow('owner_ambiguous')
  expect(provider).toEqual({ clipboard: '', external: [], approved: [] })
})
it.each(['replace', 'unmount', 'expire', 'fail'] as const)(
  'rejects asynchronous %s without a false receipt and keeps in-flight commands busy',
  async (caseName) => {
    const { run, view, props } = seed()
    let finish: (() => void) | undefined
    let fail: ((error: Error) => void) | undefined
    props.onCopy.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          finish = resolve
          fail = reject
        })
    )
    if (caseName === 'expire') {
      vi.useFakeTimers()
    }
    const request = run('copy-address', {}, Date.now() + 1000)
    const rejected = expect(request).rejects.toThrow(
      caseName === 'fail' ? 'provider_failed' : 'effect_unknown'
    )
    await expect(run()).rejects.toThrow('busy')
    if (caseName === 'replace') {
      view.rerender(<BrowserLoadFailureOverlay {...props} currentUrl="https://replaced.test/" />)
    }
    if (caseName === 'unmount') {
      view.unmount()
    }
    if (caseName === 'expire') {
      await vi.advanceTimersByTimeAsync(1000)
      await expect(run()).rejects.toThrow('busy')
    }
    if (caseName === 'fail') {
      fail?.(new Error('provider_failed'))
    } else {
      finish?.()
    }
    await rejected
  }
)
it('preserves the actual certificate failure UI and retries after a new challenge', async () => {
  const { run, view, props } = seed()
  props.onProceedCertificate.mockResolvedValue({ ok: false, reason: 'expired' })
  await act(async () => {
    await expect(run('certificate-proceed')).rejects.toThrow('certificate_refused:expired')
  })
  expect(screen.getByRole('alert').textContent).toContain('expired')
  view.rerender(
    <BrowserLoadFailureOverlay
      {...props}
      certificateFailure={{ ...props.certificateFailure, challengeId: 'new' }}
    />
  )
  props.onProceedCertificate.mockResolvedValue({ ok: true })
  await act(async () => {
    await expect(run('certificate-proceed', { challengeId: 'new' })).resolves.toMatchObject({
      accepted: true
    })
  })
})

it('rejects a captured owner after unmount before execution without provider calls', async () => {
  const { command, view, provider } = seed()
  const event = new BrowserFailureEvent('page', command, Date.now() + 5000)
  window.dispatchEvent(event)
  expect(event.offers).toHaveLength(1)
  view.unmount()
  await expect(event.offers[0]()).rejects.toThrow('owner_changed')
  expect(provider).toEqual({ clipboard: '', external: [], approved: [] })
})
it('locks the shared certificate submission before React commits a second UI click', async () => {
  const { props, provider } = seed()
  let finish: ((result: BrowserCertificateProceedResult) => void) | undefined
  props.onProceedCertificate.mockImplementation((value) => {
    provider.approved.push(value)
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const button = screen.getByRole('button', { name: 'Proceed Anyway (Unsafe)' })
  act(() => {
    button.click()
    button.click()
  })
  expect(provider.approved).toEqual(['challenge'])
  await act(async () => {
    finish?.({ ok: true })
  })
})

it('reuses retry and requires a committed loading transition rather than a void callback', async () => {
  const { props, view, run } = seed()
  useAppStore.getState().updateBrowserPageState('page', { loading: false })
  const retry = vi.fn(() =>
    useAppStore
      .getState()
      .updateBrowserPageState('page', { loading: true, title: props.loadError.validatedUrl })
  )
  view.rerender(<BrowserLoadFailureOverlay {...props} onRetry={retry} />)
  await act(async () => {
    await expect(run('retry')).resolves.toMatchObject({ action: 'retry', accepted: true })
  })
  expect(retry).toHaveBeenCalledOnce()
  expect(
    Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((page) => page.id === 'page')?.loading
  ).toBe(true)
})
it('refuses retry without a new loading transition or while loading already holds', async () => {
  const { props, view, run } = seed()
  useAppStore.getState().updateBrowserPageState('page', { loading: false })
  const retry = vi.fn()
  view.rerender(<BrowserLoadFailureOverlay {...props} onRetry={retry} />)
  await act(async () => {
    await expect(run('retry')).rejects.toThrow('retry_effect_unverifiable')
  })
  expect(retry).toHaveBeenCalledOnce()
  useAppStore.getState().updateBrowserPageState('page', { loading: true })
  retry.mockClear()
  await act(async () => {
    await expect(run('retry')).rejects.toThrow('retry_already_loading')
  })
  expect(retry).not.toHaveBeenCalled()
})

it.each([false, true])(
  'reuses the actual native failure parent retry and loading forwarding, guestRecovery=%s',
  async (recovery) => {
    const { view, run } = seed()
    view.unmount()
    const recover = vi.fn()
    const guest = Object.assign(document.createElement('webview'), { src: '' })
    const page = Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((entry) => entry.id === 'page')
    if (!page?.loadError) {
      throw new Error('missing failed page')
    }
    const code = recovery ? BROWSER_GUEST_RECOVERY_ERROR_CODE : page.loadError.code
    useAppStore
      .getState()
      .updateBrowserPageState('page', { loading: false, loadError: { ...page.loadError, code } })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The native Retry owner reads and assigns only the DOM webview src supplied by this fixture.
    const webviewRef = { current: guest as unknown as Electron.WebviewTag }
    render(
      <BrowserFailureFixtureOwner
        placement="local"
        notice={() => {}}
        localViewportOverrides={{ webviewRef, retryGuestRecoveryRef: { current: recover } }}
      />
    )
    await act(async () => {
      await expect(run('retry', { errorCode: code })).resolves.toMatchObject({
        action: 'retry',
        accepted: true
      })
    })
    const after = Object.values(useAppStore.getState().browserPagesByWorkspace)
      .flat()
      .find((entry) => entry.id === 'page')
    expect(after?.loading).toBe(true)
    if (recovery) {
      expect(recover).toHaveBeenCalledOnce()
      expect(guest.getAttribute('src')).toBeNull()
    } else {
      expect(guest.src).toBe(page.loadError.validatedUrl)
      expect(after?.title).toBe(page.loadError.validatedUrl)
      expect(recover).not.toHaveBeenCalled()
    }
  }
)

it('refuses unavailable retry targets before the original callback', async () => {
  const { props, view, run } = seed()
  const loadError = { ...props.loadError, validatedUrl: 'javascript:blocked' }
  useAppStore.getState().updateBrowserPageState('page', { loading: false, loadError })
  const retry = vi.fn()
  view.rerender(<BrowserLoadFailureOverlay {...props} loadError={loadError} onRetry={retry} />)
  await act(async () => {
    await expect(run('retry')).rejects.toThrow('retry_target_unavailable')
  })
  expect(retry).not.toHaveBeenCalled()
})

it('uses the existing HTTPS recovery callback and observes navigation before the failure owner unmounts', async () => {
  const { props, view, run } = seed()
  const loadError = { ...props.loadError, validatedUrl: 'http://localhost:3443/' }
  useAppStore.getState().updateBrowserPageState('page', { loading: false, loadError })
  const httpsRecoveryUrl = 'https://localhost:3443/'
  const navigate = vi.fn((url: string) => {
    useAppStore.getState().setBrowserPageUrl('page', url)
    useAppStore.getState().updateBrowserPageState('page', { loading: true, loadError: null })
  })
  view.rerender(
    <BrowserLoadFailureOverlay
      {...props}
      loadError={loadError}
      httpsRecoveryUrl={httpsRecoveryUrl}
      onTryHttps={navigate}
    />
  )
  await act(async () => {
    await expect(run('try-https')).resolves.toMatchObject({ action: 'try-https', accepted: true })
  })
  expect(navigate).toHaveBeenCalledExactlyOnceWith(httpsRecoveryUrl)
})
it('refuses missing, unrelated or unobserved HTTPS recovery callbacks', async () => {
  const { props, view, run } = seed()
  const loadError = { ...props.loadError, validatedUrl: 'http://localhost:3443/' }
  useAppStore.getState().updateBrowserPageState('page', { loading: false, loadError })
  const navigate = vi.fn()
  view.rerender(
    <BrowserLoadFailureOverlay
      {...props}
      loadError={loadError}
      httpsRecoveryUrl={null}
      onTryHttps={navigate}
    />
  )
  await act(async () => {
    await expect(run('try-https')).rejects.toThrow('https_unavailable')
  })
  view.rerender(
    <BrowserLoadFailureOverlay
      {...props}
      loadError={loadError}
      httpsRecoveryUrl="https://elsewhere.invalid/"
      onTryHttps={navigate}
    />
  )
  await act(async () => {
    await expect(run('try-https')).rejects.toThrow('https_unavailable')
  })
  expect(navigate).not.toHaveBeenCalled()
  view.rerender(
    <BrowserLoadFailureOverlay
      {...props}
      loadError={loadError}
      httpsRecoveryUrl="https://localhost:3443/"
      onTryHttps={navigate}
    />
  )
  await act(async () => {
    await expect(run('try-https')).rejects.toThrow('https_effect_unverifiable')
  })
  expect(navigate).toHaveBeenCalledOnce()
})

it('navigates HTTPS through the actual native viewport parent and clears its failure overlay', async () => {
  const { props, view, run } = seed()
  view.unmount()
  const loadError = { ...props.loadError, validatedUrl: 'http://localhost:3443/' }
  useAppStore.getState().setBrowserPageUrl('page', loadError.validatedUrl)
  useAppStore.getState().updateBrowserPageState('page', { loading: false, loadError })
  const guest = Object.assign(document.createElement('webview'), { src: '' })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The navigation owner uses only the DOM fixture's src property; focus is supplied separately.
  const webviewRef = { current: guest as unknown as Electron.WebviewTag }
  const focus = vi.fn(() => true)
  const navigateToUrl = (url: string) =>
    navigateBrowserPageToUrl({
      url,
      browserTabId: 'page',
      worktreeId: 'folder:fixture',
      activeLoadFailureRef: { current: loadError },
      lastKnownWebviewUrlRef: { current: null },
      trackNextLoadingEventRef: { current: false },
      recoveryNavigationValidationRef: { current: null },
      webviewRef,
      onSetUrlRef: { current: useAppStore.getState().setBrowserPageUrl },
      onUpdatePageStateRef: { current: useAppStore.getState().updateBrowserPageState },
      setAddressBarValue: () => {},
      setResourceNotice: () => {},
      focusWebviewNow: focus
    })
  render(
    <BrowserFailureFixtureOwner
      placement="local"
      notice={() => {}}
      localViewportOverrides={{ webviewRef, navigateToUrl }}
    />
  )
  await act(async () => {
    await expect(run('try-https', { expectedUrl: loadError.validatedUrl })).resolves.toMatchObject({
      action: 'try-https',
      accepted: true
    })
  })
  const after = Object.values(useAppStore.getState().browserPagesByWorkspace)
    .flat()
    .find((page) => page.id === 'page')
  expect(after).toMatchObject({ url: 'https://localhost:3443/', loading: true, loadError: null })
  expect(guest.src).toBe('https://localhost:3443/')
  expect(focus).toHaveBeenCalledOnce()
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
})
