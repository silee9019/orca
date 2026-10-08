// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { AutomationViewerActionSchema } from '../../../../shared/automation-viewer-command'
import { AutomationEditorDialog } from './AutomationEditorDialog'
import { buildAutomationEditDraft } from './automation-edit-draft'
import { makeAutomation } from './automations-page-fixtures'
import { applyAutomationEditorViewerAction } from '../../runtime/automation-editor-viewer-controller'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: ({
    value,
    onChange,
    ariaLabel
  }: {
    value: string
    onChange: (value: string) => void
    ariaLabel: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
  getAutomationPromptEditorRoot: () => null
}))

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(cleanup)

function Harness({
  holdClose = false,
  saving = false,
  editing = false
}: {
  holdClose?: boolean
  saving?: boolean
  editing?: boolean
}) {
  const [open, setOpen] = useState(true)
  const [draft, setDraft] = useState(() => buildAutomationEditDraft(makeAutomation()))
  return (
    <TooltipProvider>
      <button onClick={() => setOpen(true)}>Reopen editor</button>
      <AutomationEditorDialog
        open={open}
        isEditing={editing}
        isEditingExternal={false}
        isSaving={saving}
        canSave={true}
        createTarget="hermes"
        repos={[]}
        projectHostSetups={[]}
        automationYamlHooksByRepoKey={{}}
        getAutomationHooksCacheKey={(id) => id}
        repoMap={new Map()}
        worktrees={[]}
        settings={null}
        draft={draft}
        onProjectChange={() => undefined}
        onCreateTargetChange={() => undefined}
        onOpenChange={holdClose ? () => undefined : setOpen}
        onDraftChange={setDraft}
        onSetupDecisionTouched={() => undefined}
        onApplyTemplate={() => undefined}
        onSave={() => undefined}
      />
    </TooltipProvider>
  )
}

it('accepts the concrete editor form request at the public boundary', () => {
  expect(
    AutomationViewerActionSchema.safeParse({ kind: 'editor-form', action: { kind: 'get' } }).success
  ).toBe(true)
})

it('commits name and prompt through the real dialog and prompt section', async () => {
  render(<Harness />)
  const { reviewedTarget } = await applyAutomationEditorViewerAction({ kind: 'get' })
  let request: ReturnType<typeof applyAutomationEditorViewerAction> | undefined
  await act(async () => {
    request = applyAutomationEditorViewerAction({
      kind: 'name',
      value: '주간 감사',
      reviewedTarget
    })
  })
  await expect(request).resolves.toMatchObject({ name: '주간 감사', committed: true })
  expect(screen.getByRole('textbox', { name: 'Automation name' })).toHaveProperty(
    'value',
    '주간 감사'
  )
  await act(async () => {
    request = applyAutomationEditorViewerAction({
      kind: 'prompt',
      value: '변경 내용을 검토합니다.',
      reviewedTarget
    })
  })
  await expect(request).resolves.toMatchObject({ prompt: '변경 내용을 검토합니다.' })
  expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveProperty(
    'value',
    '변경 내용을 검토합니다.'
  )
})

it('rejects the previous editor token after actual close and reopen', async () => {
  render(<Harness />)
  const { reviewedTarget } = await applyAutomationEditorViewerAction({ kind: 'get' })
  let request: ReturnType<typeof applyAutomationEditorViewerAction> | undefined
  await act(async () => {
    request = applyAutomationEditorViewerAction({ kind: 'close', reviewedTarget })
  })
  await expect(request).resolves.toMatchObject({ open: false })
  expect(screen.queryByRole('dialog')).toBeNull()
  await expect(applyAutomationEditorViewerAction({ kind: 'get' })).rejects.toThrow(
    'viewer_unavailable'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reopen editor' }))
  await expect(
    applyAutomationEditorViewerAction({ kind: 'name', value: 'stale', reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  expect((await applyAutomationEditorViewerAction({ kind: 'get' })).reviewedTarget).not.toBe(
    reviewedTarget
  )
})

it('waits for the actual closed commit and permits cancel during saving like the existing footer', async () => {
  const page = render(<Harness holdClose saving />)
  const { reviewedTarget } = await applyAutomationEditorViewerAction({ kind: 'get' })
  let request: ReturnType<typeof applyAutomationEditorViewerAction> | undefined
  let settled = false
  await act(async () => {
    request = applyAutomationEditorViewerAction({ kind: 'close', reviewedTarget })
    void request.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
  })
  expect(settled).toBe(false)
  await expect(
    applyAutomationEditorViewerAction({ kind: 'name', value: 'busy', reviewedTarget })
  ).rejects.toThrow('viewer_busy')
  page.rerender(<Harness saving />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await expect(request).resolves.toMatchObject({ open: false, isSaving: true })
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('preserves input during saving and rejects a pending close when the actual dialog unmounts', async () => {
  const page = render(<Harness holdClose saving />)
  const { reviewedTarget } = await applyAutomationEditorViewerAction({ kind: 'get' })
  let request: ReturnType<typeof applyAutomationEditorViewerAction> | undefined
  await act(async () => {
    request = applyAutomationEditorViewerAction({
      kind: 'name',
      value: '저장 중 수정',
      reviewedTarget
    })
  })
  await expect(request).resolves.toMatchObject({ name: '저장 중 수정', isSaving: true })
  expect(screen.getByRole('textbox', { name: 'Automation name' })).toHaveProperty(
    'value',
    '저장 중 수정'
  )
  await act(async () => {
    request = applyAutomationEditorViewerAction({ kind: 'close', reviewedTarget })
    void request.catch(() => undefined)
  })
  page.unmount()
  await expect(request).rejects.toThrow('viewer_unmounted')
  await expect(applyAutomationEditorViewerAction({ kind: 'get' })).rejects.toThrow(
    'viewer_unavailable'
  )
})

it('rejects hidden create-only controls and unavailable template selections', async () => {
  const page = render(<Harness editing />)
  const { reviewedTarget } = await applyAutomationEditorViewerAction({ kind: 'get' })
  for (const action of [
    { kind: 'template-open', value: true, reviewedTarget },
    { kind: 'template-apply', templateId: 'missing', reviewedTarget },
    { kind: 'create-target', value: 'orca', reviewedTarget }
  ] as const) {
    await expect(applyAutomationEditorViewerAction(action)).rejects.toThrow(
      'automation_editor_control_unavailable'
    )
  }
  expect((await applyAutomationEditorViewerAction({ kind: 'get' })).templates).toEqual([])
  let precheck: ReturnType<typeof applyAutomationEditorViewerAction> | undefined
  await act(async () => {
    precheck = applyAutomationEditorViewerAction({
      kind: 'precheck-command',
      reviewedTarget,
      value: 'existing Hermes edit'
    })
  })
  await expect(precheck).resolves.toMatchObject({
    draft: { precheckCommand: 'existing Hermes edit' }
  })
  expect(screen.getByDisplayValue('existing Hermes edit')).toBeTruthy()
  await act(async () => {
    precheck = applyAutomationEditorViewerAction({
      kind: 'precheck-timeout',
      reviewedTarget,
      value: '600'
    })
  })
  await expect(precheck).resolves.toMatchObject({ draft: { precheckTimeoutSeconds: '600' } })
  expect(screen.getByRole('combobox', { name: 'Timeout' }).textContent).toBe('10 min')
  page.rerender(<Harness />)
  const state = await applyAutomationEditorViewerAction({ kind: 'get' })
  const template = state.templates[0]
  if (!template) {
    throw new Error('missing template fixture')
  }
  await expect(
    applyAutomationEditorViewerAction({
      kind: 'template-apply',
      reviewedTarget,
      templateId: template.id
    })
  ).rejects.toThrow('automation_template_unavailable')
  let request: ReturnType<typeof applyAutomationEditorViewerAction> | undefined
  await act(async () => {
    request = applyAutomationEditorViewerAction({
      kind: 'template-open',
      reviewedTarget,
      value: true
    })
  })
  await expect(request).resolves.toMatchObject({ templateOpen: true })
  await expect(
    applyAutomationEditorViewerAction({
      kind: 'template-apply',
      reviewedTarget,
      templateId: 'missing'
    })
  ).rejects.toThrow('automation_template_unavailable')
  await act(async () => {
    request = applyAutomationEditorViewerAction({
      kind: 'template-open',
      reviewedTarget,
      value: false
    })
  })
  await expect(request).resolves.toMatchObject({ templateOpen: false })
})
