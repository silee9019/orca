// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  applySkillShareReviewViewerAction as apply,
  useSkillShareReviewViewerController
} from '@/runtime/skill-share-review-viewer-controller'
import { SkillSharePackageSummary } from './SkillSharePackageSummary'
import { preview } from './skill-share-dialog-test-fixture'

afterEach(cleanup)
const longPreview = { ...preview, description: '설명 '.repeat(100), scriptPaths: ['run.sh'] }

it('shares the actual description and risky-file controls with the reviewed CLI action', async () => {
  render(<SkillSharePackageSummary preview={longPreview} />)
  const initial = await apply({ kind: 'get' })
  expect(initial).toMatchObject({
    description: { available: true, expanded: false },
    files: { available: true, open: false }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  expect((await apply({ kind: 'get' })).description.expanded).toBe(true)
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({
      kind: 'description',
      reviewedTarget: initial.reviewedTarget,
      expanded: false
    })
  })
  await expect(request).resolves.toMatchObject({ description: { expanded: false } })
  expect(screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-expanded')).toBe(
    'false'
  )
  await expect(
    apply({ kind: 'description', reviewedTarget: initial.reviewedTarget, expanded: false })
  ).resolves.toMatchObject({ description: { expanded: false } })
  fireEvent.click(screen.getByRole('button', { name: 'Review files that can run' }))
  expect((await apply({ kind: 'get' })).files.open).toBe(true)
  await act(async () => {
    request = apply({ kind: 'files', reviewedTarget: initial.reviewedTarget, open: false })
  })
  await expect(request).resolves.toMatchObject({ files: { open: false } })
  expect(
    screen.getByRole('button', { name: 'Review files that can run' }).getAttribute('aria-expanded')
  ).toBe('false')
  await expect(
    apply({ kind: 'skills', reviewedTarget: initial.reviewedTarget, open: false })
  ).rejects.toThrow('skill_share_review_unavailable')
})

it('retains the bundle default and rejects old preparation and hidden controls', async () => {
  const view = render(<SkillSharePackageSummary preview={longPreview} />)
  const first = await apply({ kind: 'get' })
  const member = {
    id: 'one',
    name: 'One',
    description: 'Member',
    digest: 'a'.repeat(64),
    fileCount: 1,
    totalBytes: 10,
    scriptPaths: [],
    executablePaths: []
  }
  const bundle = {
    ...preview,
    preparationId: 'next-preparation',
    skillCount: 2,
    skills: [member, { ...member, id: 'two', name: 'Two' }]
  }
  view.rerender(<SkillSharePackageSummary key={bundle.preparationId} preview={bundle} />)
  await expect(
    apply({ kind: 'description', reviewedTarget: first.reviewedTarget, expanded: true })
  ).rejects.toThrow('viewer_target_changed')
  const next = await apply({ kind: 'get' })
  expect(next).toMatchObject({
    description: { available: false },
    files: { available: false },
    skills: { available: true, open: true }
  })
  await expect(
    apply({ kind: 'description', reviewedTarget: next.reviewedTarget, expanded: true })
  ).rejects.toThrow('skill_share_review_unavailable')
  await expect(
    apply({ kind: 'files', reviewedTarget: next.reviewedTarget, open: true })
  ).rejects.toThrow('skill_share_review_unavailable')
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({ kind: 'skills', reviewedTarget: next.reviewedTarget, open: false })
  })
  await expect(request).resolves.toMatchObject({ skills: { open: false } })
  expect(
    screen.getByRole('button', { name: 'Review included skills' }).getAttribute('aria-expanded')
  ).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'Review included skills' }))
  expect((await apply({ kind: 'get' })).skills.open).toBe(true)
  view.rerender(<SkillSharePackageSummary preview={preview} />)
  const short = await apply({ kind: 'get' })
  expect(short.description.available).toBe(false)
  expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
})

it('waits for actual parent commit and rejects retargeting, unmount and ambiguity', async () => {
  const setDescriptionExpanded = vi.fn()
  const form = {
    preparationId: 'one',
    descriptionAvailable: true,
    filesAvailable: false,
    skillsAvailable: false,
    descriptionExpanded: false,
    filesOpen: false,
    skillsOpen: true,
    setDescriptionExpanded,
    setFilesOpen: vi.fn(),
    setSkillsOpen: vi.fn()
  }
  function Harness({ preparationId }: { preparationId: string }) {
    useSkillShareReviewViewerController({ ...form, preparationId })
    return null
  }
  const view = render(<Harness preparationId="one" />)
  const initial = await apply({ kind: 'get' })
  let settled = false
  const request = apply({
    kind: 'description',
    reviewedTarget: initial.reviewedTarget,
    expanded: true
  })
  void request.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    }
  )
  expect(setDescriptionExpanded).toHaveBeenCalledExactlyOnceWith(true)
  await Promise.resolve()
  expect(settled).toBe(false)
  await expect(
    apply({ kind: 'files', reviewedTarget: initial.reviewedTarget, open: true })
  ).rejects.toThrow('viewer_busy')
  view.rerender(<Harness preparationId="two" />)
  await expect(request).rejects.toThrow('viewer_target_changed')
  const next = await apply({ kind: 'get' })
  const unmounted = apply({
    kind: 'description',
    reviewedTarget: next.reviewedTarget,
    expanded: true
  })
  void unmounted.catch(() => undefined)
  view.unmount()
  await expect(unmounted).rejects.toThrow('viewer_unmounted')
  render(
    <>
      <SkillSharePackageSummary preview={preview} />
      <SkillSharePackageSummary preview={longPreview} />
    </>
  )
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
})
