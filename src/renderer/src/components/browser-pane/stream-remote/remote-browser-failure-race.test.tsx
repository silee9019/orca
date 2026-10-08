// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { applyRemoteBrowserPaneCommand } from '@/runtime/browser-remote-pane-bridge'
import { REMOTE_BROWSER_PANE_COMMAND_EVENT } from '@/runtime/browser-remote-pane-request'
import { useRemoteBrowserPaneCommands } from './use-remote-browser-pane-commands'
import { useRemoteBrowserFailureCommands } from './use-remote-browser-failure-commands'

afterEach(cleanup)
it.each([
  ['environment', 'copy-address'],
  ['environment', 'open-external'],
  ['environment', 'certificate-proceed'],
  ['page', 'copy-address'],
  ['page', 'open-external'],
  ['page', 'certificate-proceed']
] as const)(
  'rejects %s replacement between status and %s before any callback',
  async (identity, failureAction) => {
    const copy = vi.fn(async () => {})
    const openExternal = vi.fn(async () => {})
    const proceed = vi.fn(async () => ({ ok: true as const }))
    const initial = { environmentId: 'env-1', remotePageId: 'page-1' }
    const owner = renderHook(
      ({ environmentId, remotePageId }) => {
        useRemoteBrowserPaneCommands({
          page: 'local-page',
          environmentId,
          remotePageId,
          active: true,
          staged: false,
          streamStatus: { kind: 'stopped', notice: 'certificate' },
          reconnectGeneration: 0,
          reconnect: () => {}
        })
        useRemoteBrowserFailureCommands({
          page: 'local-page',
          active: true,
          visible: true,
          environmentId,
          remotePageId,
          failureUrl: 'https://fixture.invalid/',
          capable: true,
          externalAvailable: true,
          failure: {
            challengeId: 'challenge-1',
            browserPageId: remotePageId,
            errorCode: -202,
            error: 'certificate',
            origin: 'https://fixture.invalid',
            displayHost: 'fixture.invalid',
            canProceed: true,
            observedAt: 1
          },
          copy,
          openExternal,
          proceed
        })
      },
      { initialProps: initial }
    )
    const replace = (): void => {
      owner.rerender(
        identity === 'environment'
          ? { ...initial, environmentId: 'env-2' }
          : { ...initial, remotePageId: 'page-2' }
      )
    }
    window.addEventListener(REMOTE_BROWSER_PANE_COMMAND_EVENT, replace, { once: true })
    try {
      await expect(
        applyRemoteBrowserPaneCommand(
          'local-page',
          {
            action: 'failure',
            failureAction,
            challengeId: 'challenge-1',
            environmentId: 'env-1',
            expectedRemotePageId: 'page-1'
          },
          Date.now() + 1000
        )
      ).rejects.toThrow('remote_browser_failure_owner_mismatch')
      expect(copy).not.toHaveBeenCalled()
      expect(openExternal).not.toHaveBeenCalled()
      expect(proceed).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(REMOTE_BROWSER_PANE_COMMAND_EVENT, replace)
      owner.unmount()
    }
  }
)
