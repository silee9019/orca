// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useSkillShareReviewViewerController } from './skill-share-review-viewer-controller'
import {
  applySkillShareViewerAction as apply,
  useSkillShareViewerController
} from './skill-share-viewer-controller'
import { preview } from '../components/skills/skill-share-dialog-test-fixture'

afterEach(cleanup)

function fixture() {
  const publish = vi.fn().mockResolvedValue(undefined)
  const form = {
    open: true,
    skillIds: ['one'],
    preview,
    hasCloudAccount: true,
    releaseNotes: '',
    setReleaseNotes: vi.fn(),
    preparing: false,
    publishing: false,
    cancelling: false,
    progress: null,
    shareUrl: null,
    error: null,
    publish,
    cancelPublish: vi.fn().mockResolvedValue(undefined),
    copyLink: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    manageLinks: vi.fn().mockResolvedValue(undefined)
  }
  const review = {
    preparationId: preview.preparationId,
    descriptionAvailable: true,
    filesAvailable: false,
    skillsAvailable: false,
    descriptionExpanded: false,
    filesOpen: false,
    skillsOpen: true,
    setDescriptionExpanded: vi.fn(),
    setFilesOpen: vi.fn(),
    setSkillsOpen: vi.fn()
  }
  const hook = renderHook(
    ({ expanded, skillIds, open }) => {
      useSkillShareReviewViewerController({ ...review, descriptionExpanded: expanded })
      useSkillShareViewerController({ ...form, skillIds, open })
    },
    { initialProps: { expanded: false, skillIds: ['one'], open: true } }
  )
  return { publish, review, hook }
}

it('fences publication until the actual review parent commits', async () => {
  const { publish, review, hook } = fixture()
  const initial = (await apply({ kind: 'get' })).review
  if (!initial) {
    throw new Error('review fixture missing')
  }
  const request = apply({
    kind: 'review',
    action: { kind: 'description', reviewedTarget: initial.reviewedTarget, expanded: true }
  })
  void request.catch(() => undefined)
  expect(review.setDescriptionExpanded).toHaveBeenCalledExactlyOnceWith(true)
  await expect(apply({ kind: 'publish' })).rejects.toThrow('viewer_busy')
  expect(publish).not.toHaveBeenCalled()
  await act(async () => {
    hook.rerender({ expanded: true, skillIds: ['one'], open: true })
  })
  await expect(request).resolves.toMatchObject({ review: { description: { expanded: true } } })
})

it.each(['owner', 'closed'] as const)(
  'rejects a committed child after the parent %s changes',
  async (change) => {
    const { publish, hook } = fixture()
    const initial = (await apply({ kind: 'get' })).review
    if (!initial) {
      throw new Error('review fixture missing')
    }
    const request = apply({
      kind: 'review',
      action: { kind: 'description', reviewedTarget: initial.reviewedTarget, expanded: true }
    })
    void request.catch(() => undefined)
    await act(async () => {
      hook.rerender({
        expanded: true,
        skillIds: change === 'owner' ? ['two'] : ['one'],
        open: change !== 'closed'
      })
    })
    await expect(request).rejects.toThrow(
      change === 'owner' ? 'viewer_target_changed' : 'viewer_unmounted'
    )
    expect(publish).not.toHaveBeenCalled()
  }
)
