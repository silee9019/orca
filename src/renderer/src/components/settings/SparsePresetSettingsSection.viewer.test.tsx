import Picker from '../sparse/SparseCheckoutPresetSelect'
// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mocks, installAutomationsPageHarness } from '../automations/automations-page-test-harness'
import { makeStoreState, REPO_ID } from '../automations/automations-page-fixtures'
import type { SparsePreset } from '../../../../shared/worktree/create-types'
import { SparsePresetViewerActionSchema } from '../../../../shared/sparse-preset-viewer-command'
import { applySparsePresetViewerAction as apply } from '../../runtime/sparse-preset-viewer-controller'
import { SparsePresetSettingsSection as Section } from './SparsePresetSettingsSection'
installAutomationsPageHarness()
afterEach(cleanup)
const preset: SparsePreset = {
  id: 'web',
  repoId: REPO_ID,
  name: 'Web',
  directories: ['apps/web'],
  createdAt: 1,
  updatedAt: 1
}
let savedPresets: SparsePreset[] = []
beforeEach(() => {
  savedPresets = [preset]
  mocks.state.repos = [...makeStoreState().repoMap.values()]
  mocks.state.sparsePresetsByRepo = { [REPO_ID]: savedPresets }
  mocks.state.sparsePresetsLoadStatusByRepo = { [REPO_ID]: 'loaded' }
  mocks.state.sparsePresetsErrorByRepo = {}
  mocks.state.activeOrcaProfileId = 'owner-1'
  mocks.state.saveSparsePreset = vi.fn(
    async (input: { id?: string; name: string; directories: string[] }) => {
      const saved = {
        ...preset,
        id: input.id ?? 'new',
        name: input.name,
        directories: input.directories
      }
      savedPresets = [...savedPresets.filter((entry) => entry.id !== saved.id), saved]
      mocks.state.sparsePresetsByRepo = { [REPO_ID]: savedPresets }
      return saved
    }
  )
  mocks.state.removeSparsePreset = vi.fn(async (input: { presetId: string }) => {
    savedPresets = savedPresets.filter((entry) => entry.id !== input.presetId)
    mocks.state.sparsePresetsByRepo = { [REPO_ID]: savedPresets }
  })
})
const get = () => apply({ repoId: REPO_ID, surface: 'settings', action: { kind: 'get' } })
async function run(action: Record<string, unknown>) {
  const current = await get()
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({
      repoId: REPO_ID,
      surface: 'settings',
      action: SparsePresetViewerActionSchema.parse({
        reviewedTarget: current.reviewedTarget,
        ...action
      })
    })
    void request.catch(() => undefined)
  })
  return request
}
it('uses actual settings draft controls and save service for native update and CLI creation', async () => {
  render(<Section repoId={REPO_ID} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit Web' }))
  expect((await get()).draft?.presetId).toBe('web')
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save preset' }))
  await waitFor(async () => expect((await get()).draft).toBeNull())
  expect(savedPresets[0]?.name).toBe('Renamed')
  await run({ kind: 'new' })
  await run({ kind: 'name-touch' })
  await run({ kind: 'directories-add', directories: ['tools'] })
  await run({ kind: 'draft', name: 'Tools', directoriesText: 'tools' })
  expect(await run({ kind: 'save' })).toMatchObject({
    draft: null,
    outcome: { operation: 'saved', editorClosed: true, selected: false }
  })
  expect(savedPresets.map((entry) => entry.name)).toEqual(['Renamed', 'Tools'])
  await run({ kind: 'edit', presetId: 'web' })
  fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' })
  expect((await get()).draft).toBeNull()
  await run({ kind: 'edit', presetId: 'web' })
  expect(await run({ kind: 'cancel' })).toMatchObject({ draft: null })
})
it('preserves separate delete confirmation, blur cancellation and stale-review refusal', async () => {
  render(<Section repoId={REPO_ID} />)
  await expect(run({ kind: 'delete-confirm', presetId: 'web' })).rejects.toThrow(
    'sparse_preset_confirmation_required'
  )
  const held = await get()
  fireEvent.click(screen.getByRole('button', { name: 'Delete Web' }))
  expect((await get()).confirmingDeleteId).toBe('web')
  expect(mocks.state.removeSparsePreset).not.toHaveBeenCalled()
  fireEvent.blur(screen.getByRole('button', { name: 'Delete Web' }))
  expect((await get()).confirmingDeleteId).toBeNull()
  await run({ kind: 'delete-request', presetId: 'web' })
  await expect(
    apply({
      repoId: REPO_ID,
      surface: 'settings',
      action: { kind: 'delete-confirm', presetId: 'web', reviewedTarget: held.reviewedTarget }
    })
  ).rejects.toThrow('viewer_target_changed')
  await run({ kind: 'delete-cancel', presetId: 'web' })
  await run({ kind: 'delete-request', presetId: 'web' })
  expect(await run({ kind: 'delete-confirm', presetId: 'web' })).toMatchObject({
    confirmingDeleteId: null,
    outcome: { operation: 'deleted', presetId: 'web', confirmationCleared: true }
  })
  expect(savedPresets).toEqual([])
  expect(mocks.state.removeSparsePreset).toHaveBeenCalledExactlyOnceWith({
    repoId: REPO_ID,
    presetId: 'web'
  })
})
it('keeps failure confirmation and draft, blocks incompatible settings controls', async () => {
  mocks.state.removeSparsePreset = vi.fn().mockRejectedValue(new Error('disk failed'))
  mocks.state.saveSparsePreset = vi.fn().mockResolvedValue(null)
  render(<Section repoId={REPO_ID} />)
  await run({ kind: 'delete-request', presetId: 'web' })
  expect(await run({ kind: 'delete-confirm', presetId: 'web' })).toMatchObject({
    confirmingDeleteId: 'web',
    outcome: { operation: 'delete-unconfirmed' }
  })
  expect(screen.getByRole('alert').textContent).toContain('disk failed')
  await run({ kind: 'delete-cancel', presetId: 'web' })
  await run({ kind: 'edit', presetId: 'web' })
  expect(await run({ kind: 'save' })).toMatchObject({
    draft: { presetId: 'web' },
    outcome: { operation: 'unconfirmed' }
  })
  await expect(run({ kind: 'delete-request', presetId: 'web' })).rejects.toThrow(
    'sparse_preset_delete_unavailable'
  )
  await run({ kind: 'cancel' })
  await expect(run({ kind: 'open', value: true })).rejects.toThrow(
    'sparse_preset_control_unavailable'
  )
})
it('preserves delete acknowledgement after profile replacement and return', async () => {
  let complete: (() => void) | undefined
  mocks.state.removeSparsePreset = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve
      })
  )
  const view = render(<Section repoId={REPO_ID} />)
  await run({ kind: 'delete-request', presetId: 'web' })
  const request = run({ kind: 'delete-confirm', presetId: 'web' })
  await waitFor(async () => expect((await get()).busy).toBe(true))
  await expect(run({ kind: 'new' })).rejects.toThrow('viewer_busy')
  mocks.state.activeOrcaProfileId = 'owner-2'
  view.rerender(<Section repoId={REPO_ID} />)
  mocks.state.activeOrcaProfileId = 'owner-1'
  view.rerender(<Section repoId={REPO_ID} />)
  if (!complete) {
    throw new Error('completion missing')
  }
  const finish = complete
  await act(async () => {
    finish()
  })
  expect(await request).toMatchObject({
    confirmingDeleteId: 'web',
    outcome: { operation: 'deleted', confirmationCleared: false, reviewStatus: 'changed' }
  })
})
it('keeps selector defaults and explicit settings routes distinct when both are mounted', async () => {
  render(
    <>
      <Section repoId={REPO_ID} />
      <Picker
        repoId={REPO_ID}
        presets={[preset]}
        selectedPresetId={null}
        onSelectPreset={() => undefined}
      />
    </>
  )
  expect((await get()).surface).toBe('settings')
  expect((await apply({ repoId: REPO_ID, action: { kind: 'get' } })).surface).toBe('selector')
  await run({ kind: 'new' })
  expect((await get()).draft?.mode).toBe('new')
  expect((await apply({ repoId: REPO_ID, action: { kind: 'get' } })).draft).toBeNull()
})
it('awaits settings retry and distinguishes its loaded list from load failure', async () => {
  mocks.state.sparsePresetsByRepo = {}
  mocks.state.sparsePresetsLoadStatusByRepo = { [REPO_ID]: 'error' }
  mocks.state.sparsePresetsErrorByRepo = { [REPO_ID]: 'offline' }
  mocks.state.fetchSparsePresets = vi.fn(async () => {
    mocks.state.sparsePresetsByRepo = { [REPO_ID]: [preset] }
    mocks.state.sparsePresetsLoadStatusByRepo = { [REPO_ID]: 'loaded' }
    mocks.state.sparsePresetsErrorByRepo = {}
  })
  render(<Section repoId={REPO_ID} />)
  expect(await run({ kind: 'retry' })).toMatchObject({
    loaded: true,
    loading: false,
    loadError: null
  })
  expect(mocks.state.fetchSparsePresets).toHaveBeenCalledExactlyOnceWith(REPO_ID)
})
it('retains a save acknowledgement across owner replacement, clears it for a later owner and rejects unmount', async () => {
  let complete: ((preset: SparsePreset) => void) | undefined
  mocks.state.saveSparsePreset = vi.fn(
    () =>
      new Promise<SparsePreset>((resolve) => {
        complete = resolve
      })
  )
  const view = render(<Section repoId={REPO_ID} />)
  await run({ kind: 'edit', presetId: 'web' })
  const request = run({ kind: 'save' })
  await waitFor(async () => expect((await get()).busy).toBe(true))
  mocks.state.activeOrcaProfileId = 'owner-2'
  view.rerender(<Section repoId={REPO_ID} />)
  if (!complete) {
    throw new Error('completion missing')
  }
  const finish = complete
  await act(async () => {
    finish(preset)
  })
  expect(await request).toMatchObject({
    draft: { presetId: 'web' },
    outcome: { operation: 'saved', editorClosed: false, reviewStatus: 'changed' }
  })
  expect((await get()).outcomeReviewedTarget).toBeTruthy()
  mocks.state.activeOrcaProfileId = 'owner-3'
  view.rerender(<Section repoId={REPO_ID} />)
  expect((await get()).outcome).toBeNull()
  const pending = run({ kind: 'save' })
  void pending.catch(() => undefined)
  await waitFor(async () => expect((await get()).busy).toBe(true))
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  if (!complete) {
    throw new Error('completion missing')
  }
  const finishLate = complete
  await act(async () => {
    finishLate(preset)
  })
  await expect(get()).rejects.toThrow('viewer_unavailable')
})
