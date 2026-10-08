import { expect, it } from 'vitest'
import { ClientHostedBrowserRowPublisher } from './client-hosted-browser-row-publication'
import type { RuntimeBrowserClientPage } from './runtime-browser-page-registry'
import type { ClientHostedBrowserRowsEvent } from '../../shared/client-hosted-browser-rows'
it('reads the same complete projection without claiming delivery to the renderer', () => {
  let pages: RuntimeBrowserClientPage[] = [
    {
      browserPageId: 'page',
      workspaceId: 'folder:fixture',
      browserProfileId: 'default',
      executionHostKey: 'native:fixture:0',
      placement: {
        kind: 'client',
        browserHostClientId: 'fixture-client',
        browserHostGeneration: 1,
        pageHostGeneration: 1
      },
      url: 'https://example.test',
      title: 'Fixture',
      loading: true,
      active: false,
      canGoBack: false,
      canGoForward: false,
      metadataRevision: 0
    }
  ]
  const events: ClientHostedBrowserRowsEvent[] = []
  const publisher = new ClientHostedBrowserRowPublisher({
    listClientPages: () => pages,
    hasLivePlacement: () => false,
    resolveDeviceName: () => null,
    getEmitter: () => (event) => events.push(event)
  })
  expect(publisher.readSnapshot()).toEqual([
    {
      worktreeId: 'folder:fixture',
      rows: [
        {
          browserPageId: 'page',
          worktreeId: 'folder:fixture',
          url: 'https://example.test',
          title: 'Fixture',
          loading: false,
          browserHostClientId: 'fixture-client',
          hostDeviceName: null,
          hostAbsent: true
        }
      ]
    }
  ])
  pages = []
  publisher.publish('folder:fixture')
  expect(events).toHaveLength(0)
})
