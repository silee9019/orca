import { expect, it, vi } from 'vitest'
import { RuntimeBrowserPageRegistry } from '../../src/main/runtime/runtime-browser-page-registry'
import { createBrowserClientPageMetadataPublisher } from '../../src/renderer/src/components/browser-pane/browser-client-page-metadata-publisher'
const placement = {
  kind: 'client' as const,
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const snapshot = {
  url: 'https://after.test/',
  title: 'After',
  loading: false,
  canGoBack: true,
  canGoForward: false
}
function authority() {
  const pages = new RuntimeBrowserPageRegistry()
  pages.publishClientPage({
    browserPageId: 'page',
    workspaceId: 'folder',
    browserProfileId: 'default',
    executionHostKey: 'paired-host',
    placement,
    url: 'https://before.test/',
    loading: false,
    active: true
  })
  return pages
}
it('acknowledges the exact newer revision only after the actual authority store changes', async () => {
  const pages = authority()
  const acknowledgment = vi.fn()
  const publisher = createBrowserClientPageMetadataPublisher({
    browserPageId: 'page',
    placement,
    nextRevision: () => 7,
    publish: async (params) => ({
      status: 'published',
      accepted: pages.updatePageMetadata(params.browserPageId, placement, params)
    })
  })
  publisher.publish(snapshot, acknowledgment)
  await vi.waitFor(() => expect(acknowledgment).toHaveBeenCalledWith(7))
  expect(pages.getPage('page')).toMatchObject({ ...snapshot, metadataRevision: 7, placement })
})
it('refuses duplicate revision and replaced authority placement without an accepted receipt', async () => {
  const pages = authority()
  pages.updatePageMetadata('page', placement, { ...snapshot, revision: 7 })
  const acknowledgment = vi.fn()
  const publisher = createBrowserClientPageMetadataPublisher({
    browserPageId: 'page',
    placement,
    nextRevision: () => 7,
    publish: async (params) => ({
      status: 'published',
      accepted: pages.updatePageMetadata(params.browserPageId, placement, params)
    })
  })
  publisher.publish(snapshot, acknowledgment)
  await vi.waitFor(() => expect(acknowledgment).toHaveBeenCalledExactlyOnceWith(null))
  pages.replaceClientPagePlacement('page', placement, { ...placement, pageHostGeneration: 5 })
  publisher.publish(snapshot, acknowledgment)
  await vi.waitFor(() => expect(acknowledgment).toHaveBeenCalledTimes(2))
  expect(acknowledgment).toHaveBeenLastCalledWith(null)
  expect(pages.getPage('page')?.metadataRevision).toBe(0)
})
