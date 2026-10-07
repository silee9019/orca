// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { requestRemoteBrowserPane } from '@/runtime/browser-remote-pane-request'
import { useRemoteBrowserPaneCommands } from './use-remote-browser-pane-commands'
afterEach(cleanup)
it('acknowledges the synchronous document transition even when conversion unmounts the stream owner', async () => {
  let unmount = () => {}
  const convert = vi.fn(() => {
    unmount()
    return {
      outcome: 'converted' as const,
      page: 'local-page',
      workspace: 'workspace',
      worktree: 'folder:fixture'
    }
  })
  const owner = renderHook(() =>
    useRemoteBrowserPaneCommands({
      page: 'local-page',
      environmentId: 'env-1',
      remotePageId: 'page-1',
      active: true,
      staged: false,
      streamStatus: { kind: 'live' },
      reconnectGeneration: 0,
      reconnect: () => {},
      performDocument: convert
    })
  )
  unmount = owner.unmount
  await expect(
    requestRemoteBrowserPane(
      'local-page',
      {
        environmentId: 'env-1',
        expectedRemotePageId: 'page-1',
        action: 'document',
        document: {
          kind: 'workspace-doc',
          worktreeId: 'folder:fixture',
          filePath: '/fixture/report.html'
        }
      },
      Date.now() + 1000
    )
  ).resolves.toMatchObject({ document: { outcome: 'converted', page: 'local-page' } })
  expect(convert).toHaveBeenCalledOnce()
})
