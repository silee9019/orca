// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mocks, installAutomationsPageHarness } from '../automations/automations-page-test-harness'
import { makeStoreState, REPO_ID } from '../automations/automations-page-fixtures'
import type { SparsePreset } from '../../../../shared/worktree/create-types'
import { SparsePresetViewerActionSchema } from '../../../../shared/sparse-preset-viewer-command'
import { applySparsePresetViewerAction as apply } from '../../runtime/sparse-preset-viewer-controller'
import Picker from './SparseCheckoutPresetSelect'
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
beforeEach(() => {
  mocks.state.repos = [...makeStoreState().repoMap.values()]
  mocks.state.sparsePresetsByRepo = { [REPO_ID]: [preset] }
  mocks.state.sparsePresetsLoadStatusByRepo = { [REPO_ID]: 'loaded' }
  mocks.state.sparsePresetsErrorByRepo = {}
  mocks.state.activeOrcaProfileId = 'owner-1'
})
function Field({ disabled = false }: { disabled?: boolean }) {
  const [selected, select] = useState<string | null>(null)
  return (
    <Picker
      repoId={REPO_ID}
      presets={[preset]}
      selectedPresetId={selected}
      onSelectPreset={(value) => select(value?.id ?? null)}
      disabled={disabled}
    />
  )
}
const get = () => apply({ repoId: REPO_ID, action: { kind: 'get' } })
async function run(action: Record<string, unknown>) {
  const current = await get()
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({
      repoId: REPO_ID,
      action: SparsePresetViewerActionSchema.parse({
        reviewedTarget: current.reviewedTarget,
        ...action
      })
    })
    void request.catch(() => undefined)
  })
  return request
}
it('selects the same saved preset through native chooser and CLI, then turns sparse checkout off', async () => {
  const view = render(<Field />)
  fireEvent.click(screen.getByRole('combobox', { name: 'Checkout preset' }))
  fireEvent.click(screen.getByRole('option', { name: /Web/ }))
  const native = await get()
  expect(native.selectedPresetId).toBe('web')
  view.unmount()
  render(<Field />)
  await run({ kind: 'open', value: true })
  const held = await get()
  expect(await run({ kind: 'select', presetId: 'web' })).toMatchObject({
    open: false,
    selectedPresetId: native.selectedPresetId
  })
  await expect(
    apply({
      repoId: REPO_ID,
      action: { kind: 'open', reviewedTarget: held.reviewedTarget, value: true }
    })
  ).rejects.toThrow('viewer_target_changed')
  await run({ kind: 'open', value: true })
  expect(await run({ kind: 'off' })).toMatchObject({ open: false, selectedPresetId: null })
})
it('shares draft editing and existing save service, preserving normalized name and paths', async () => {
  const save = vi.fn(
    async (input: { repoId: string; id?: string; name: string; directories: string[] }) => {
      const saved = {
        ...preset,
        id: input.id ?? 'new',
        name: input.name,
        directories: input.directories
      }
      mocks.state.sparsePresetsByRepo = { [REPO_ID]: [preset, saved] }
      return saved
    }
  )
  mocks.state.saveSparsePreset = save
  render(<Field />)
  await run({ kind: 'open', value: true })
  await run({ kind: 'new' })
  await expect(run({ kind: 'save' })).rejects.toThrow('sparse_preset_draft_invalid')
  expect(save).not.toHaveBeenCalled()
  await run({ kind: 'draft', name: '  Tools  ', directoriesText: 'tools\npackages/ui' })
  const result = await run({ kind: 'save' })
  expect(save).toHaveBeenCalledExactlyOnceWith({
    repoId: REPO_ID,
    id: undefined,
    name: 'Tools',
    directories: ['tools', 'packages/ui']
  })
  expect(result).toMatchObject({
    draft: null,
    selectedPresetId: 'new',
    outcome: { operation: 'saved', selected: true, editorClosed: true, reviewStatus: 'current' }
  })
  expect((await get()).presets.some((entry) => entry.id === 'new')).toBe(true)
  await run({ kind: 'open', value: true })
  await run({ kind: 'edit', presetId: 'web' })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Native renamed' } })
  expect((await get()).draft?.name).toBe('Native renamed')
  fireEvent.click(screen.getByRole('button', { name: 'Save preset' }))
  await waitFor(async () => expect((await get()).draft).toBeNull())
  expect(save).toHaveBeenLastCalledWith({
    repoId: REPO_ID,
    id: 'web',
    name: 'Native renamed',
    directories: ['apps/web']
  })
  await run({ kind: 'open', value: true })
  await run({ kind: 'edit', presetId: 'web' })
  expect(await run({ kind: 'cancel' })).toMatchObject({ draft: null })
})
it('retains failed draft and refuses hidden, disabled, missing and ambiguous targets', async () => {
  mocks.state.saveSparsePreset = vi.fn().mockResolvedValue(null)
  const view = render(<Field />)
  await expect(run({ kind: 'new' })).rejects.toThrow('sparse_preset_chooser_closed')
  await run({ kind: 'open', value: true })
  await expect(run({ kind: 'edit', presetId: 'missing' })).rejects.toThrow(
    'sparse_preset_not_visible'
  )
  await run({ kind: 'edit', presetId: 'web' })
  expect(await run({ kind: 'save' })).toMatchObject({
    draft: { presetId: 'web' },
    outcome: { operation: 'unconfirmed' }
  })
  expect(screen.getByRole('alert').textContent).toContain('Try again')
  view.rerender(<Field disabled />)
  await expect(run({ kind: 'cancel' })).rejects.toThrow('sparse_preset_disabled')
  render(<Field />)
  await expect(get()).rejects.toThrow('viewer_ambiguous')
  await expect(apply({ repoId: 'missing', action: { kind: 'get' } })).rejects.toThrow(
    'viewer_unavailable'
  )
})
it('waits for save, blocks competing actions and latches profile replacement and return', async () => {
  let complete: ((value: SparsePreset) => void) | undefined
  mocks.state.saveSparsePreset = vi.fn(
    () =>
      new Promise<SparsePreset>((resolve) => {
        complete = resolve
      })
  )
  const view = render(<Field />)
  await run({ kind: 'open', value: true })
  await run({ kind: 'new' })
  await run({ kind: 'draft', name: 'New', directoriesText: 'src' })
  const request = run({ kind: 'save' })
  await waitFor(async () => expect((await get()).submitting).toBe(true))
  await expect(run({ kind: 'cancel' })).rejects.toThrow('viewer_busy')
  mocks.state.activeOrcaProfileId = 'owner-2'
  view.rerender(<Field />)
  mocks.state.activeOrcaProfileId = 'owner-1'
  view.rerender(<Field />)
  if (!complete) {
    throw new Error('completion missing')
  }
  const finish = complete
  await act(async () => {
    finish({ ...preset, id: 'new' })
  })
  expect(await request).toMatchObject({
    selectedPresetId: null,
    draft: { mode: 'new' },
    outcome: { operation: 'saved', selected: false, editorClosed: false, reviewStatus: 'changed' }
  })
})
it('awaits retry and preserves an explicit failed load', async () => {
  mocks.state.sparsePresetsByRepo = {}
  mocks.state.sparsePresetsLoadStatusByRepo = {}
  mocks.state.fetchSparsePresets = vi.fn(async () => {
    mocks.state.sparsePresetsErrorByRepo = { [REPO_ID]: 'offline' }
    mocks.state.sparsePresetsLoadStatusByRepo = { [REPO_ID]: 'error' }
  })
  render(<Field />)
  await run({ kind: 'open', value: true })
  await expect(run({ kind: 'new' })).rejects.toThrow('sparse_presets_not_loaded')
  expect(await run({ kind: 'retry' })).toMatchObject({
    loaded: false,
    loading: false,
    loadError: 'offline'
  })
  expect(mocks.state.fetchSparsePresets).toHaveBeenCalledExactlyOnceWith(REPO_ID)
})
it('rejects unmount while a write remains in flight and ignores its late UI completion', async () => {
  let complete: ((value: SparsePreset) => void) | undefined
  mocks.state.saveSparsePreset = vi.fn(
    () =>
      new Promise<SparsePreset>((resolve) => {
        complete = resolve
      })
  )
  const view = render(<Field />)
  await run({ kind: 'open', value: true })
  await run({ kind: 'edit', presetId: 'web' })
  const request = run({ kind: 'save' })
  void request.catch(() => undefined)
  await waitFor(async () => expect((await get()).submitting).toBe(true))
  view.unmount()
  await expect(request).rejects.toThrow('viewer_unmounted')
  if (!complete) {
    throw new Error('completion missing')
  }
  const finish = complete
  await act(async () => {
    finish(preset)
  })
  await expect(get()).rejects.toThrow('viewer_unavailable')
})
it('refuses runtime-owned selectors instead of invoking the desktop preset store', async () => {
  mocks.state.repos = [...makeStoreState().repoMap.values()].map((repo) => ({
    ...repo,
    executionHostId: 'runtime:remote' as const
  }))
  const save = vi.fn()
  mocks.state.saveSparsePreset = save
  render(<Field />)
  await expect(run({ kind: 'open', value: true })).rejects.toThrow('sparse_preset_disabled')
  expect(save).not.toHaveBeenCalled()
})
it('uses desktop-owned preset metadata for a registered SSH repository without remote execution', async () => {
  mocks.state.repos = [...makeStoreState().repoMap.values()].map((repo) => ({
    ...repo,
    connectionId: 'builder'
  }))
  const save = vi.fn().mockResolvedValue(preset)
  mocks.state.saveSparsePreset = save
  render(<Field />)
  await run({ kind: 'open', value: true })
  await run({ kind: 'edit', presetId: 'web' })
  expect(await run({ kind: 'save' })).toMatchObject({
    outcome: { operation: 'saved', preset: { repoId: REPO_ID } }
  })
  expect(save).toHaveBeenCalledExactlyOnceWith({
    repoId: REPO_ID,
    id: 'web',
    name: 'Web',
    directories: ['apps/web']
  })
  expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
})
it('refuses a preset hidden by the current native chooser search', async () => {
  render(<Field />)
  await run({ kind: 'open', value: true })
  fireEvent.change(screen.getByPlaceholderText('Find a preset…'), { target: { value: 'absent' } })
  await waitFor(() => expect(screen.queryByRole('option', { name: /Web/ })).toBeNull())
  await expect(run({ kind: 'select', presetId: 'web' })).rejects.toThrow(
    'sparse_preset_not_visible'
  )
})
