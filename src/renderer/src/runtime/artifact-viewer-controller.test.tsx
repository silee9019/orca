// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  applyArtifactViewerAction,
  useArtifactViewerController
} from './artifact-viewer-controller'

afterEach(cleanup)
const refresh = vi.fn(async () => {})
function Viewer({
  identity = 'profile-a',
  error = null
}: {
  identity?: string
  error?: string | null
}) {
  const state = useArtifactViewerController({
    identity,
    slugs: ['first', 'second'],
    visibleSlugs: () => ['first', 'second'],
    refresh,
    loadMore: refresh,
    hasMore: true,
    loading: false,
    error
  })
  return <output>{JSON.stringify({ query: state.query, selectedSlug: state.selectedSlug })}</output>
}

it('acknowledges query and selection only after their committed state and rejects unknown slugs', async () => {
  render(<Viewer />)
  let request: ReturnType<typeof applyArtifactViewerAction> | undefined
  act(() => {
    request = applyArtifactViewerAction({ kind: 'query', value: '한국어' })
  })
  let result = await request
  expect(result).toMatchObject({ query: '한국어', viewer: 'desktop', committed: true })
  expect(screen.getByRole('status').textContent).toContain('한국어')
  act(() => {
    request = applyArtifactViewerAction({ kind: 'select', slug: 'second' })
  })
  result = await request
  expect(result).toMatchObject({ selectedSlug: 'second' })
  expect(screen.getByRole('status').textContent).toContain('second')
  await expect(applyArtifactViewerAction({ kind: 'select', slug: 'missing' })).rejects.toThrow(
    'artifact_not_loaded'
  )
})

it('rejects absent and ambiguous mounted viewers and pending requests on account changes', async () => {
  await expect(applyArtifactViewerAction({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  const first = render(<Viewer />)
  const second = render(<Viewer />)
  await expect(applyArtifactViewerAction({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  second.unmount()
  const pending = applyArtifactViewerAction({ kind: 'query', value: 'draft' })
  const rejection = expect(pending).rejects.toThrow('viewer_target_changed')
  first.rerender(<Viewer identity="profile-b" />)
  await rejection
})

it('keeps asynchronous refresh busy until completion and rejects a pending request on unmount', async () => {
  let finish: (() => void) | undefined
  refresh.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const viewer = render(<Viewer />)
  const pending = applyArtifactViewerAction({ kind: 'refresh' })
  await expect(applyArtifactViewerAction({ kind: 'query', value: 'busy' })).rejects.toThrow(
    'viewer_busy'
  )
  await act(async () => {
    finish?.()
  })
  await expect(pending).resolves.toMatchObject({ committed: true })
  let request: ReturnType<typeof applyArtifactViewerAction> | undefined
  act(() => {
    request = applyArtifactViewerAction({ kind: 'query', value: 'closing' })
    viewer.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
})

it('reports a refresh error from committed UI state instead of a successful refresh', async () => {
  render(<Viewer error="Could not load artifacts." />)
  let request: ReturnType<typeof applyArtifactViewerAction> | undefined
  await act(async () => {
    request = applyArtifactViewerAction({ kind: 'refresh' })
    request.catch(() => {})
  })
  await expect(request).rejects.toThrow('artifact_refresh_failed')
})
