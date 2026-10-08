// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mocks, installAutomationsPageHarness } from '../automations/automations-page-test-harness'
import { makeStoreState, REPO_ID } from '../automations/automations-page-fixtures'
import type { SparsePreset } from '../../../../shared/worktree/create-types'
import { SparsePresetViewerActionSchema } from '../../../../shared/sparse-preset-viewer-command'
import { applySparsePresetViewerAction as apply } from '../../runtime/sparse-preset-viewer-controller'
import Picker from './SparseCheckoutPresetSelect'
installAutomationsPageHarness()
afterEach(cleanup)
const presets: SparsePreset[] = ['Web', 'API'].map((name) => ({
  id: name,
  name,
  repoId: REPO_ID,
  directories: [`apps/${name.toLowerCase()}`],
  createdAt: 1,
  updatedAt: 1
}))
beforeEach(() => {
  mocks.state.repos = [...makeStoreState().repoMap.values()]
  mocks.state.sparsePresetsByRepo = { [REPO_ID]: presets }
  mocks.state.sparsePresetsLoadStatusByRepo = { [REPO_ID]: 'loaded' }
  mocks.state.sparsePresetsErrorByRepo = {}
})
function Field() {
  const [selected, select] = useState<string | null>(null)
  return (
    <Picker
      repoId={REPO_ID}
      presets={presets}
      selectedPresetId={selected}
      onSelectPreset={(value) => select(value?.id ?? null)}
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
it('waits for native cmdk search and highlight and refuses filtered select, edit and full checkout', async () => {
  render(<Field />)
  expect(await run({ kind: 'open', value: true })).toMatchObject({
    chooser: { query: '', searchSettled: true }
  })
  const held = await get()
  expect(await run({ kind: 'chooser-query', value: 'Web' })).toMatchObject({
    chooser: {
      query: 'Web',
      visibleValues: ['preset:Web'],
      searchSettled: true,
      commandSettled: true
    }
  })
  expect(screen.queryByRole('option', { name: /API/ })).toBeNull()
  expect(screen.queryByRole('option', { name: /Full checkout/ })).toBeNull()
  await expect(
    apply({
      repoId: REPO_ID,
      action: { kind: 'select', presetId: 'Web', reviewedTarget: held.reviewedTarget }
    })
  ).rejects.toThrow('viewer_target_changed')
  for (const action of [
    { kind: 'select', presetId: 'API' },
    { kind: 'edit', presetId: 'API' },
    { kind: 'off' },
    { kind: 'chooser-command', value: 'preset:API' }
  ]) {
    await expect(run(action)).rejects.toThrow('sparse_preset_not_visible')
  }
  await run({ kind: 'chooser-query', value: '' })
  expect(await run({ kind: 'chooser-command', value: 'preset:API' })).toMatchObject({
    chooser: { commandValue: 'preset:API', commandSettled: true }
  })
  expect(screen.getByRole('option', { name: /API/ }).getAttribute('data-selected')).toBe('true')
  expect(await run({ kind: 'select', presetId: 'API' })).toMatchObject({
    selectedPresetId: 'API',
    open: false
  })
})
it('shares actual native select/full/new/edit callbacks and CLI transitions', async () => {
  render(<Field />)
  fireEvent.click(screen.getByRole('combobox', { name: 'Checkout preset' }))
  fireEvent.click(screen.getByRole('option', { name: /API/ }))
  expect((await get()).selectedPresetId).toBe('API')
  await run({ kind: 'open', value: true })
  fireEvent.click(screen.getByRole('option', { name: /Full checkout/ }))
  expect((await get()).selectedPresetId).toBeNull()
  await run({ kind: 'open', value: true })
  await run({ kind: 'select', presetId: 'API' })
  await run({ kind: 'open', value: true })
  expect(await run({ kind: 'off' })).toMatchObject({ selectedPresetId: null, open: false })
  await run({ kind: 'open', value: true })
  fireEvent.click(screen.getByRole('button', { name: 'Edit Web' }))
  const nativeEdit = (await get()).draft
  await run({ kind: 'cancel' })
  await run({ kind: 'open', value: true })
  expect((await run({ kind: 'edit', presetId: 'Web' }))?.draft).toEqual(nativeEdit)
  await run({ kind: 'cancel' })
  await run({ kind: 'open', value: true })
  fireEvent.click(screen.getByRole('button', { name: 'New preset' }))
  const nativeNew = (await get()).draft
  await run({ kind: 'cancel' })
  await run({ kind: 'open', value: true })
  expect((await run({ kind: 'new' }))?.draft).toEqual(nativeNew)
})
it('rejects excessive UTF-8 queries and unknown fields in chooser requests', () => {
  const reviewedTarget = '00000000-0000-4000-8000-000000000001'
  expect(
    SparsePresetViewerActionSchema.safeParse({
      kind: 'chooser-query',
      reviewedTarget,
      value: '한'.repeat(683)
    }).success
  ).toBe(false)
  expect(
    SparsePresetViewerActionSchema.safeParse({
      kind: 'chooser-command',
      reviewedTarget,
      value: 'full',
      force: true
    }).success
  ).toBe(false)
})
