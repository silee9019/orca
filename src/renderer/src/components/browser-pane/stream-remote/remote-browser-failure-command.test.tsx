// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { requestRemoteBrowserFailure } from '@/runtime/browser-remote-failure-request'
import { RemoteBrowserPageViewport } from './remote-browser-page-viewport'
vi.mock('@/runtime/runtime-rpc-client', async () => ({
  callRuntimeRpc: vi.fn(async () => ({ ok: true })),
  RuntimeRpcCallError: (await import('@/runtime/runtime-rpc-result')).RuntimeRpcCallError
}))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('uses the actual viewport failure callbacks and capability/page/challenge fences', async () => {
  const provider: { clipboard: string; external: string[]; trusted: string[] } = {
    clipboard: '',
    external: [],
    trusted: []
  }
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        writeClipboardText: async (text: string) => {
          provider.clipboard = text
        }
      },
      shell: {
        openUrl: async (url: string) => {
          provider.external.push(url)
        }
      }
    }
  })
  vi.mocked(callRuntimeRpc).mockImplementation(async (target, method, params) => {
    if (
      method === 'browser.certificate.proceed' &&
      typeof params === 'object' &&
      params &&
      'challengeId' in params &&
      typeof params.challengeId === 'string'
    ) {
      provider.trusted.push(params.challengeId)
    }
    expect(target).toEqual({ kind: 'environment', environmentId: 'env-1' })
    return { ok: true }
  })
  function Owner({
    capable = true,
    origin = 'https://fixture.invalid'
  }: {
    capable?: boolean
    origin?: string
  }) {
    return (
      <RemoteBrowserPageViewport
        isActive
        remoteViewportRef={useRef(null)}
        imageRef={useRef(null)}
        frameUrl={null}
        frameMetadata={null}
        busy={false}
        markup={{
          state: 'idle',
          isActive: false,
          baseImage: null,
          start: async () => {},
          cancel: () => {},
          complete: async () => {}
        }}
        browserTab={{
          id: 'local-page',
          workspaceId: 'workspace',
          worktreeId: 'folder',
          url: 'https://fixture.invalid/',
          title: 'Fixture',
          loading: false,
          faviconUrl: null,
          canGoBack: false,
          canGoForward: false,
          createdAt: 1,
          loadError: {
            code: -202,
            description: 'certificate',
            validatedUrl: 'https://fixture.invalid/'
          }
        }}
        remoteError={null}
        streamStatus={{ kind: 'stopped', notice: 'certificate' }}
        remoteCertificateTrustSupported={capable}
        certificateFailure={{
          challengeId: 'challenge-1',
          browserPageId: 'page-1',
          errorCode: -202,
          error: 'certificate',
          origin,
          displayHost: 'fixture.invalid',
          canProceed: true,
          observedAt: 1
        }}
        remotePageHandle={{ environmentId: 'env-1', remotePageId: 'page-1' }}
        activeRuntimeEnvironmentId="env-1"
        worktreeId="folder"
        runtimeWorktree="folder:fixture"
        runtimeTarget={() => ({ kind: 'environment', environmentId: 'env-1' })}
        onReload={() => {}}
        onGoto={() => {}}
        onReconnect={() => {}}
        handleRemotePointerDown={() => {}}
        handleRemotePointerUp={() => {}}
        handleRemoteContextMenu={() => {}}
        handleRemoteScreenshotKeyDown={() => {}}
      />
    )
  }
  const owner = render(<Owner />)
  const request = (
    failureAction: 'copy-address' | 'open-external' | 'certificate-proceed',
    challengeId = 'challenge-1'
  ) =>
    requestRemoteBrowserFailure(
      'local-page',
      {
        action: 'failure',
        failureAction,
        challengeId,
        environmentId: 'env-1',
        expectedRemotePageId: 'page-1'
      },
      Date.now() + 1000
    )
  await expect(request('copy-address')).resolves.toMatchObject({ clipboardRequested: true })
  expect(provider.clipboard).toContain('fixture.invalid')
  await expect(request('open-external')).resolves.toMatchObject({ externalRequested: true })
  expect(provider.external).toEqual(['https://fixture.invalid/'])
  await expect(request('certificate-proceed', 'stale')).rejects.toThrow(
    'remote_browser_certificate_challenge_mismatch'
  )
  expect(provider.trusted).toHaveLength(0)
  await expect(request('certificate-proceed')).resolves.toMatchObject({ certificate: { ok: true } })
  expect(provider.trusted).toEqual(['challenge-1'])
  owner.rerender(<Owner origin="https://other.invalid" />)
  await expect(request('certificate-proceed')).rejects.toThrow(
    'remote_browser_certificate_challenge_mismatch'
  )
  expect(provider.trusted).toHaveLength(1)
  owner.rerender(<Owner capable={false} />)
  await expect(request('certificate-proceed')).rejects.toThrow(
    'remote_browser_certificate_unsupported'
  )
  expect(provider.trusted).toHaveLength(1)
})
