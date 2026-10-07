import { installClientHostedPaneApi } from './browser-pane/client-hosted-browser-pane-test-rig'
import { act } from '@testing-library/react'
import { vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../shared/constants'
import type { BrowserWebAuthnAccountRequest } from '../../../shared/browser-webauthn-account'
export function installWebAuthnDialogFixture(clientHosted = false) {
  const requests = new Set<(request: BrowserWebAuthnAccountRequest) => void>()
  const closures = new Set<(event: { requestId: string }) => void>()
  const accepted: { requestId: string; credentialId: string | null }[] = []
  const respond = vi.fn(async (value: { requestId: string; credentialId: string | null }) => {
    accepted.push(value)
    return true
  })
  installClientHostedPaneApi({
    browser: {
      respondWebAuthnAccount: respond,
      onWebAuthnAccountRequest: (callback: (request: BrowserWebAuthnAccountRequest) => void) => {
        requests.add(callback)
        return () => requests.delete(callback)
      },
      onWebAuthnAccountRequestClosed: (callback: (event: { requestId: string }) => void) => {
        closures.add(callback)
        return () => closures.delete(callback)
      }
    }
  })
  useAppStore.setState({
    settings: getDefaultSettings('/fixture'),
    persistedUIReady: true,
    activeWorktreeId: 'folder:fixture'
  })
  useAppStore.getState().createBrowserTab('folder:fixture', 'https://fixture.invalid/', {
    browserPageId: 'page',
    ...(clientHosted ? { browserRuntimeEnvironmentId: 'environment' } : {})
  })
  if (clientHosted) {
    useAppStore.getState().setRemoteBrowserPageHandle('page', {
      environmentId: 'environment',
      remotePageId: 'remote-page',
      placement: {
        kind: 'client',
        browserHostClientId: 'fixture',
        browserHostGeneration: 3,
        pageHostGeneration: 7
      }
    })
  }
  const push = (requestId = 'request', relyingPartyId = 'fixture.invalid') => {
    act(() => {
      for (const callback of requests) {
        callback({
          requestId,
          browserPageId: 'page',
          relyingPartyId,
          accounts: [{ credentialId: 'fixture-credential', displayName: 'Fixture Account' }]
        })
      }
    })
  }
  return {
    push,
    respond,
    accepted,
    close: (requestId = 'request') =>
      act(() => {
        for (const callback of closures) {
          callback({ requestId })
        }
      }),
    listenerCount: () => requests.size + closures.size
  }
}
export const webAuthnDialogTarget = {
  requestId: 'request',
  page: 'page',
  worktreeId: 'folder:fixture',
  environmentId: null,
  relyingPartyId: 'fixture.invalid',
  credentialId: null
}
