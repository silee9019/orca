// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { applySkillShareViewerAction } from '@/runtime/skill-share-viewer-controller'
import { SkillShareDialog } from './SkillShareDialog'
import { skill, preview } from './skill-share-dialog-test-fixture'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
function setup() {
  const skills = {
    listManagedInstalls: vi.fn().mockResolvedValue({ status: 'ok', value: [] }),
    prepareShare: vi.fn().mockResolvedValue(preview),
    releaseShare: vi.fn().mockResolvedValue(undefined),
    publishShare: vi.fn().mockResolvedValue({
      status: 'ok',
      value: { share: { url: 'https://app.orca.dev/skills/share/fixture' } }
    }),
    cancelShare: vi.fn().mockResolvedValue(undefined),
    onShareProgress: vi.fn(() => () => undefined)
  }
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills,
      ui: { writeClipboardText },
      orcaProfiles: {
        authStatus: vi.fn().mockResolvedValue({ cloud: { email: 'fixture@example.invalid' } })
      }
    }
  })
  function Harness() {
    const [open, setOpen] = useState(true)
    return <SkillShareDialog skill={skill} open={open} onOpenChange={setOpen} />
  }
  render(<Harness />)
  return { skills, writeClipboardText }
}

it('pins preparation and release notes, copies only the resulting link, and closes the actual dialog', async () => {
  const { skills, writeClipboardText } = setup()
  await waitFor(async () => {
    expect((await applySkillShareViewerAction({ kind: 'get' })).preparing).toBe(false)
  })
  await expect(applySkillShareViewerAction({ kind: 'copy-link' })).rejects.toThrow(
    'skill_share_link_unavailable'
  )
  let request: ReturnType<typeof applySkillShareViewerAction> | undefined
  await act(async () => {
    request = applySkillShareViewerAction({ kind: 'release-notes', value: '첫 줄\n둘째 줄' })
  })
  await expect(request).resolves.toMatchObject({ releaseNotes: '첫 줄\n둘째 줄' })
  await act(async () => {
    request = applySkillShareViewerAction({ kind: 'publish' })
  })
  await expect(request).resolves.toMatchObject({
    publishing: false,
    shareUrl: 'https://app.orca.dev/skills/share/fixture'
  })
  expect(skills.publishShare).toHaveBeenCalledExactlyOnceWith({
    preparationId: preview.preparationId,
    releaseNotes: '첫 줄\n둘째 줄'
  })
  await act(async () => {
    request = applySkillShareViewerAction({ kind: 'copy-link' })
  })
  await request
  expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith(
    'https://app.orca.dev/skills/share/fixture'
  )
  await act(async () => {
    request = applySkillShareViewerAction({ kind: 'close' })
  })
  await expect(request).resolves.toMatchObject({ closed: true })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('separates cancellation acknowledgement from upload completion and preserves a retryable preparation', async () => {
  const { skills } = setup()
  await waitFor(async () => {
    expect((await applySkillShareViewerAction({ kind: 'get' })).preparing).toBe(false)
  })
  await expect(applySkillShareViewerAction({ kind: 'cancel' })).rejects.toThrow(
    'skill_share_upload_not_active'
  )
  await expect(
    applySkillShareViewerAction({ kind: 'release-notes', value: '가'.repeat(10_001) })
  ).rejects.toThrow()
  let rejectPublish!: (cause: Error) => void
  skills.publishShare.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectPublish = reject
      })
  )
  let upload: ReturnType<typeof applySkillShareViewerAction> | undefined
  await act(async () => {
    upload = applySkillShareViewerAction({ kind: 'publish' })
  })
  await expect(applySkillShareViewerAction({ kind: 'close' })).rejects.toThrow('viewer_busy')
  await expect(
    applySkillShareViewerAction({ kind: 'release-notes', value: 'changed' })
  ).rejects.toThrow('viewer_busy')
  let request: ReturnType<typeof applySkillShareViewerAction> | undefined
  await act(async () => {
    request = applySkillShareViewerAction({ kind: 'cancel' })
  })
  await expect(request).resolves.toMatchObject({
    publishing: true,
    cancelling: true,
    shareUrl: null
  })
  expect(skills.cancelShare).toHaveBeenCalledExactlyOnceWith(preview.preparationId)
  await expect(applySkillShareViewerAction({ kind: 'cancel' })).rejects.toThrow('viewer_busy')
  await act(async () => {
    rejectPublish(new Error('fixture cancellation'))
  })
  await expect(upload).resolves.toMatchObject({
    publishing: false,
    cancelling: false,
    error: 'Upload cancelled. The prepared copy is still available to retry.',
    preview: { preparationId: preview.preparationId }
  })
  skills.publishShare.mockResolvedValue({
    status: 'ok',
    value: { share: { url: 'https://app.orca.dev/skills/share/retry' } }
  })
  await act(async () => {
    request = applySkillShareViewerAction({ kind: 'publish' })
  })
  await expect(request).resolves.toMatchObject({
    shareUrl: 'https://app.orca.dev/skills/share/retry',
    error: null
  })
})

it('waits for requested preparation cleanup after closing the rendered dialog', async () => {
  const { skills } = setup()
  await waitFor(async () => {
    expect((await applySkillShareViewerAction({ kind: 'get' })).preparing).toBe(false)
  })
  let finish!: () => void
  const releasing = new Promise<void>((resolve) => {
    finish = resolve
  })
  skills.releaseShare.mockReturnValue(releasing)
  let request: ReturnType<typeof applySkillShareViewerAction> | undefined
  let settled = false
  await act(async () => {
    request = applySkillShareViewerAction({ kind: 'close' })
    request.then(() => {
      settled = true
    })
  })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(settled).toBe(false)
  expect(skills.releaseShare).toHaveBeenCalledWith(preview.preparationId)
  await act(async () => {
    finish()
  })
  await expect(request).resolves.toMatchObject({ closed: true })
})

it('requires exactly one mounted sharing dialog', async () => {
  await expect(applySkillShareViewerAction({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  await act(async () => {
    setup()
    setup()
  })
  await expect(applySkillShareViewerAction({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
})
