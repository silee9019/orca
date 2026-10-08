// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mocks, installAutomationsPageHarness } from '../automations/automations-page-test-harness'
import { makeStoreState, REPO_ID } from '../automations/automations-page-fixtures'
import { SparsePresetViewerActionSchema } from '../../../../shared/sparse-preset-viewer-command'
import { applySparsePresetViewerAction as apply } from '../../runtime/sparse-preset-viewer-controller'
import Picker from './SparseCheckoutPresetSelect'
installAutomationsPageHarness()
afterEach(cleanup)
beforeEach(() => {
  mocks.state.repos = [...makeStoreState().repoMap.values()]
  mocks.state.sparsePresetsByRepo = { [REPO_ID]: [] }
  mocks.state.sparsePresetsLoadStatusByRepo = { [REPO_ID]: 'loaded' }
  mocks.state.sparsePresetsErrorByRepo = {}
})
function Field() {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <Picker
      repoId={REPO_ID}
      presets={[]}
      selectedPresetId={selected}
      onSelectPreset={(value) => setSelected(value?.id ?? null)}
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
it('reveals the same name error as native blur and resets touched state when editor remounts', async () => {
  render(<Field />)
  await run({ kind: 'open', value: true })
  await run({ kind: 'new' })
  expect((await get()).draftControls?.nameTouched).toBe(false)
  expect(screen.queryByText('Name is required.')).toBeNull()
  expect(await run({ kind: 'name-touch' })).toMatchObject({ draftControls: { nameTouched: true } })
  expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true')
  await run({ kind: 'cancel' })
  await run({ kind: 'open', value: true })
  await run({ kind: 'new' })
  expect((await get()).draftControls?.nameTouched).toBe(false)
  fireEvent.blur(screen.getByLabelText('Name'))
  expect((await get()).draftControls?.nameTouched).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect((await get()).draft).toBeNull()
})
it('adds normalized unique relative directories and removes the same native chip', async () => {
  render(<Field />)
  await run({ kind: 'open', value: true })
  await run({ kind: 'new' })
  const held = await get()
  expect(
    await run({ kind: 'directories-add', directories: ['apps/web', 'packages/ui', 'apps/web'] })
  ).toMatchObject({
    draft: { directoriesText: 'apps/web\npackages/ui' },
    draftControls: { directories: ['apps/web', 'packages/ui'] }
  })
  await expect(
    apply({
      repoId: REPO_ID,
      action: {
        kind: 'directory-remove',
        reviewedTarget: held.reviewedTarget,
        directory: 'apps/web'
      }
    })
  ).rejects.toThrow('viewer_target_changed')
  fireEvent.click(screen.getByRole('button', { name: 'Remove apps/web' }))
  const native = await get()
  await run({ kind: 'directories-add', directories: ['apps/web'] })
  expect(await run({ kind: 'directory-remove', directory: 'apps/web' })).toMatchObject({
    draft: native.draft,
    draftControls: native.draftControls
  })
  await expect(run({ kind: 'directory-remove', directory: 'missing' })).rejects.toThrow(
    'sparse_directory_not_selected'
  )
  for (const directory of ['/absolute', '../parent', '.']) {
    await expect(run({ kind: 'directories-add', directories: [directory] })).rejects.toThrow(
      'sparse_directory_invalid'
    )
  }
  expect((await get()).draft?.directoriesText).toBe('packages/ui')
  await run({ kind: 'cancel' })
  await expect(run({ kind: 'name-touch' })).rejects.toThrow('sparse_preset_editor_closed')
})
