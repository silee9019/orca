// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeWorktree, REPO_ID } from './automations-page-fixtures'
import {
  mocks,
  installAutomationsPageHarness,
  settleHostQueries
} from './automations-page-test-harness'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import { AutomationViewerActionSchema } from '../../../../shared/automation-viewer-command'
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
async function picker(action: unknown) {
  const field = await workspace({ kind: 'get' })
  if (!field) {
    throw new Error('missing workspace')
  }
  return workspace({ kind: 'picker-form', reviewedTarget: field.reviewedTarget, action })
}
async function mount() {
  const primary = makeWorktree({ displayName: 'Primary workspace' })
  const alternate = makeWorktree({
    id: 'alternate',
    displayName: 'Alternate workspace',
    path: '/fixture/alternate'
  })
  mocks.state.worktreesByRepo = { [REPO_ID]: [primary, alternate] }
  mocks.worktreeMap.set(alternate.id, alternate)
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
  const field = await workspace({ kind: 'get' })
  if (!field) {
    throw new Error('missing workspace')
  }
  await workspace({ kind: 'mode', value: 'existing', reviewedTarget: field.reviewedTarget })
}
it('shares actual Dialog picker open, focus, select and close callbacks with public CLI', async () => {
  await mount()
  fireEvent.click(screen.getByRole('combobox', { name: 'Workspace' }))
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search workspaces...'))
  )
  const native = await picker({ kind: 'get' })
  expect(native?.picker).toMatchObject({ open: true, searchFocused: true })
  fireEvent.click(screen.getByRole('option', { name: 'Alternate workspace' }))
  expect((await workspace({ kind: 'get' }))?.workspaceId).toBe('alternate')
  const closed = (await picker({ kind: 'get' }))?.picker
  if (!closed) {
    throw new Error('missing picker')
  }
  const opened = (
    await picker({ kind: 'open', value: true, reviewedTarget: closed.reviewedTarget })
  )?.picker
  if (!opened) {
    throw new Error('missing picker')
  }
  expect(opened.open).toBe(true)
  const focused = (await picker({ kind: 'focus', reviewedTarget: opened.reviewedTarget }))?.picker
  expect(focused?.searchFocused).toBe(true)
  const current = (await picker({ kind: 'get' }))?.picker
  if (!current) {
    throw new Error('missing picker')
  }
  const selected = await picker({
    kind: 'select',
    workspaceId: 'alternate',
    reviewedTarget: current.reviewedTarget
  })
  expect(selected).toMatchObject({
    workspaceId: 'alternate',
    picker: { value: 'alternate', open: false }
  })
  const next = selected?.picker
  if (!next) {
    throw new Error('missing picker')
  }
  await expect(picker({ kind: 'focus', reviewedTarget: next.reviewedTarget })).rejects.toThrow(
    'automation_workspace_picker_closed'
  )
  await expect(
    picker({ kind: 'select', workspaceId: 'foreign', reviewedTarget: next.reviewedTarget })
  ).rejects.toThrow('automation_workspace_unavailable')
  const openAgain = (
    await picker({ kind: 'open', value: true, reviewedTarget: next.reviewedTarget })
  )?.picker
  if (!openAgain) {
    throw new Error('missing picker')
  }
  expect(
    (await picker({ kind: 'open', value: false, reviewedTarget: openAgain.reviewedTarget }))?.picker
      ?.open
  ).toBe(false)
})
