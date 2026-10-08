import { expect, it, vi } from 'vitest'
import { createBrowserClientPageMetadataPublisher } from './browser-client-page-metadata-publisher'
const placement = {
  kind: 'client' as const,
  browserHostClientId: 'client',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const snapshot = {
  url: 'https://example.test',
  title: 'Page',
  loading: false,
  canGoBack: false,
  canGoForward: false
}
it('acknowledges only the accepted revision for its submitted snapshot', async () => {
  const acknowledgment = vi.fn()
  const publisher = createBrowserClientPageMetadataPublisher({
    browserPageId: 'page',
    placement,
    nextRevision: () => 7,
    publish: async () => ({ status: 'published', accepted: true })
  })
  publisher.publish(snapshot, acknowledgment)
  await vi.waitFor(() => expect(acknowledgment).toHaveBeenCalledWith(7))
})
function deferred() {
  let resolve: (value: { status: 'published'; accepted: boolean }) => void = () => {}
  const promise = new Promise<{ status: 'published'; accepted: boolean }>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
it('never acknowledges an older in-flight publication as the queued command snapshot', async () => {
  const first = deferred()
  const second = deferred()
  const publish = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const acknowledgment = vi.fn()
  let revision = 0
  const publisher = createBrowserClientPageMetadataPublisher({
    browserPageId: 'page',
    placement,
    nextRevision: () => ++revision,
    publish
  })
  publisher.publish({ ...snapshot, url: 'https://old.test' })
  publisher.publish(snapshot, acknowledgment)
  first.resolve({ status: 'published', accepted: true })
  await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(2))
  expect(acknowledgment).not.toHaveBeenCalled()
  second.resolve({ status: 'published', accepted: true })
  await vi.waitFor(() => expect(acknowledgment).toHaveBeenCalledWith(2))
})
it('refuses an acknowledgment when ordinary updates supersede its queued snapshot', async () => {
  const first = deferred()
  const acknowledgment = vi.fn()
  const publish = vi.fn().mockReturnValue(first.promise)
  const publisher = createBrowserClientPageMetadataPublisher({
    browserPageId: 'page',
    placement,
    nextRevision: () => 1,
    publish
  })
  publisher.publish(snapshot)
  publisher.publish(snapshot, acknowledgment)
  publisher.publish({ ...snapshot, title: 'Newer' })
  expect(acknowledgment).toHaveBeenCalledExactlyOnceWith(null)
  publisher.dispose()
  first.resolve({ status: 'published', accepted: true })
})
it('cancels both in-flight and queued command acknowledgment on disposal', async () => {
  const first = deferred()
  const active = vi.fn()
  const pending = vi.fn()
  const publisher = createBrowserClientPageMetadataPublisher({
    browserPageId: 'page',
    placement,
    nextRevision: () => 1,
    publish: () => first.promise
  })
  publisher.publish(snapshot, active)
  publisher.publish(snapshot, pending)
  publisher.dispose()
  first.resolve({ status: 'published', accepted: true })
  await Promise.resolve()
  expect(active).toHaveBeenCalledExactlyOnceWith(null)
  expect(pending).toHaveBeenCalledExactlyOnceWith(null)
})
it.each(['rejected', 'refused', 'failed', 'throw'] as const)(
  'refuses %s metadata instead of producing a success receipt',
  async (failure) => {
    const acknowledgment = vi.fn()
    const publisher = createBrowserClientPageMetadataPublisher({
      browserPageId: 'page',
      placement,
      nextRevision: () => 1,
      publish: async () => {
        if (failure === 'throw') {
          throw new Error('disconnected')
        }
        if (failure === 'rejected') {
          return { status: 'published', accepted: false }
        }
        if (failure === 'failed') {
          return { status: 'failed', errorCode: 'disconnected' }
        }
        return { status: 'refused' }
      }
    })
    publisher.publish(snapshot, acknowledgment)
    await vi.waitFor(() => expect(acknowledgment).toHaveBeenCalledExactlyOnceWith(null))
  }
)
it.each([undefined, { status: 'published' }, { status: 'published', accepted: 'yes' }])(
  'refuses an old or malformed provider acknowledgment %j',
  async (outcome) => {
    const acknowledgment = vi.fn()
    const publisher = createBrowserClientPageMetadataPublisher({
      browserPageId: 'page',
      placement,
      nextRevision: () => 1,
      publish: vi.fn().mockResolvedValue(outcome)
    })
    publisher.publish(snapshot, acknowledgment)
    await vi.waitFor(() => expect(acknowledgment).toHaveBeenCalledExactlyOnceWith(null))
  }
)
