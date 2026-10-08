// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { installAutomationsPageHarness, settleHostQueries } from './automations-page-test-harness'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import { AutomationViewerActionSchema } from '../../../../shared/automation-viewer-command'
const refs = vi.hoisted(() => ({
  search: vi.fn(async () => ['feature-base']),
  defaults: vi.fn(async () => ({ defaultBaseRef: 'main', remoteCount: 1 }))
}))
vi.mock('@/runtime/runtime-repo-client', () => ({
  searchRuntimeRepoBaseRefs: refs.search,
  getRuntimeRepoBaseRefDefault: refs.defaults
}))
vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
async function request(action: Parameters<typeof apply>[0]) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
async function workspace(action: unknown) {
  const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
  if (!editor) {
    throw new Error('missing editor')
  }
  return (
    await request(
      AutomationViewerActionSchema.parse({
        kind: 'editor-form',
        action: { kind: 'workspace-form', reviewedTarget: editor.reviewedTarget, action }
      })
    )
  ).editorForm?.workspace
}
it('uses actual CreateFromPicker and public CLI for the same base branch, with exact host ref validation', async () => {
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  render(<Page />)
  await settleHostQueries()
  await request({ kind: 'editor-create' })
  const existing = await workspace({ kind: 'get' })
  if (!existing) {
    throw new Error('missing workspace')
  }
  await expect(
    workspace({
      kind: 'base-branch',
      reviewedTarget: existing.reviewedTarget,
      value: 'feature-base'
    })
  ).rejects.toThrow('automation_base_branch_unavailable')
  fireEvent.click(screen.getByRole('radio', { name: 'New run' }))
  await settleHostQueries()
  const field = screen
    .getByRole('radio', { name: 'New run' })
    .closest('[role="radiogroup"]')?.parentElement
  if (!field) {
    throw new Error('missing workspace field')
  }
  fireEvent.click(within(field).getByRole('combobox'))
  await waitFor(() => expect(screen.getByRole('option', { name: 'feature-base' })).toBeTruthy())
  fireEvent.click(screen.getByRole('option', { name: 'feature-base' }))
  const native = await workspace({ kind: 'get' })
  expect(native?.baseBranch).toBe('feature-base')
  if (!native) {
    throw new Error('missing branch field')
  }
  await workspace({ kind: 'base-branch', reviewedTarget: native.reviewedTarget, value: '' })
  const cli = await workspace({
    kind: 'base-branch',
    reviewedTarget: native.reviewedTarget,
    value: 'feature-base'
  })
  expect(cli?.baseBranch).toBe(native.baseBranch)
  expect(refs.search).toHaveBeenLastCalledWith(
    { activeRuntimeEnvironmentId: null },
    'repo-1',
    'feature-base',
    30,
    'local'
  )
  await expect(
    workspace({ kind: 'base-branch', reviewedTarget: native.reviewedTarget, value: 'missing-ref' })
  ).rejects.toThrow('automation_base_branch_unavailable')
  expect((await workspace({ kind: 'get' }))?.baseBranch).toBe('feature-base')
})
