// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applySkillListViewerAction } from '@/runtime/skill-list-viewer-controller'
import { SkillsList } from './SkillsList'
import { skill, secondSkill } from './skill-share-dialog-test-fixture'
import { addShareableSkillResults } from './skill-share-selection'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it('opens loaded details, reuses file actions, and closes detail before sharing its loaded skill', async () => {
  const onShare = vi.fn()
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  const openInFileManager = vi.fn().mockResolvedValue({ ok: true })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText }, shell: { openInFileManager } }
  })
  render(
    <TooltipProvider>
      <SkillsList
        skills={[skill, secondSkill]}
        allSkills={[skill, secondSkill]}
        local
        agentByRootPath={new Map()}
        selectedIds={new Set()}
        selectionMode={null}
        deleteSupported
        deleteUnsupportedReason={null}
        onSelectedChange={vi.fn()}
        onSelectResults={vi.fn()}
        onShare={onShare}
        onDelete={vi.fn()}
      />
    </TooltipProvider>
  )
  await expect(applySkillListViewerAction({ kind: 'detail', id: 'missing' })).rejects.toThrow(
    'skill_not_visible'
  )
  let request: ReturnType<typeof applySkillListViewerAction> | undefined
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'activate', id: skill.id, range: false })
  })
  await expect(request).resolves.toMatchObject({ detailSkill: { id: skill.id } })
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail-action', action: 'copy-path' })
  })
  await request
  expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith(skill.skillFilePath)
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail-action', action: 'reveal' })
  })
  await expect(request).resolves.toMatchObject({ revealResult: { ok: true } })
  expect(openInFileManager).toHaveBeenCalledExactlyOnceWith(skill.skillFilePath)
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail-action', action: 'share' })
  })
  await expect(request).resolves.toMatchObject({ detailSkill: null })
  expect(onShare).toHaveBeenCalledExactlyOnceWith(skill)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('uses the existing range selection and focus order', async () => {
  function Harness() {
    const [selected, setSelected] = useState(new Set<string>())
    return (
      <TooltipProvider>
        <SkillsList
          skills={[skill, secondSkill]}
          allSkills={[skill, secondSkill]}
          local
          agentByRootPath={new Map()}
          selectedIds={selected}
          selectionMode="share"
          deleteSupported
          deleteUnsupportedReason={null}
          onSelectedChange={(id, selected) =>
            setSelected((current) => {
              const next = new Set(current)
              if (selected) {
                next.add(id)
              } else {
                next.delete(id)
              }
              return next
            })
          }
          onSelectResults={(results) =>
            setSelected((current) =>
              addShareableSkillResults(current, [skill, secondSkill], results, true)
            )
          }
          onShare={vi.fn()}
          onDelete={vi.fn()}
        />
      </TooltipProvider>
    )
  }
  render(<Harness />)
  let request: ReturnType<typeof applySkillListViewerAction> | undefined
  await act(async () => {
    request = applySkillListViewerAction({
      kind: 'select',
      id: skill.id,
      selected: true,
      range: false
    })
  })
  await expect(request).resolves.toMatchObject({ selectedSkillIds: [skill.id] })
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'activate', id: secondSkill.id, range: true })
  })
  await expect(request).resolves.toMatchObject({
    selectedSkillIds: [skill.id, secondSkill.id],
    detailSkill: null
  })
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'focus', value: 'last' })
  })
  await expect(request).resolves.toMatchObject({ focusedId: secondSkill.id })
  expect(document.activeElement?.getAttribute('data-skill-row')).toBe(secondSkill.id)
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'focus', value: 'previous' })
  })
  await expect(request).resolves.toMatchObject({ focusedId: skill.id })
})

it('rejects remote reveal and sharing and blocks list changes behind another dialog', async () => {
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  const openInFileManager = vi.fn()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText }, shell: { openInFileManager } }
  })
  const props = {
    skills: [skill],
    allSkills: [skill],
    local: false,
    agentByRootPath: new Map<string, string>(),
    selectedIds: new Set<string>(),
    selectionMode: null,
    deleteSupported: true,
    deleteUnsupportedReason: null,
    onSelectedChange: vi.fn(),
    onSelectResults: vi.fn(),
    onShare: vi.fn(),
    onDelete: vi.fn()
  }
  const view = render(
    <TooltipProvider>
      <SkillsList {...props} />
    </TooltipProvider>
  )
  let request: ReturnType<typeof applySkillListViewerAction> | undefined
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail', id: skill.id })
  })
  await request
  await expect(
    applySkillListViewerAction({ kind: 'detail-action', action: 'reveal' })
  ).rejects.toThrow('skill_reveal_remote_unsupported')
  await expect(
    applySkillListViewerAction({ kind: 'detail-action', action: 'share' })
  ).rejects.toThrow('skill_selection_ineligible')
  expect(openInFileManager).not.toHaveBeenCalled()
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail-action', action: 'copy-path' })
  })
  await request
  expect(writeClipboardText).toHaveBeenCalledWith(skill.skillFilePath)
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail', id: null })
  })
  await request
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} locked />
    </TooltipProvider>
  )
  await expect(
    applySkillListViewerAction({ kind: 'activate', id: skill.id, range: false })
  ).rejects.toThrow('viewer_modal_open')
})

it('retains range filtering for duplicate names and rejects their direct selection', async () => {
  const duplicate = { ...skill, id: 'repo:duplicate', sourceKind: 'repo' as const }
  const skills = [skill, duplicate, secondSkill]
  function Harness() {
    const [selected, setSelected] = useState(new Set<string>())
    return (
      <TooltipProvider>
        <SkillsList
          skills={skills}
          allSkills={skills}
          local
          agentByRootPath={new Map()}
          selectedIds={selected}
          selectionMode="share"
          deleteSupported
          deleteUnsupportedReason={null}
          onSelectedChange={(id, selected) =>
            setSelected((current) => {
              const next = new Set(current)
              if (selected) {
                next.add(id)
              } else {
                next.delete(id)
              }
              return next
            })
          }
          onSelectResults={(results) =>
            setSelected((current) => addShareableSkillResults(current, skills, results, true))
          }
          onShare={vi.fn()}
          onDelete={vi.fn()}
        />
      </TooltipProvider>
    )
  }
  render(<Harness />)
  let request: ReturnType<typeof applySkillListViewerAction> | undefined
  await act(async () => {
    request = applySkillListViewerAction({
      kind: 'select',
      id: skill.id,
      selected: true,
      range: false
    })
  })
  await request
  await expect(
    applySkillListViewerAction({ kind: 'select', id: duplicate.id, selected: true, range: false })
  ).rejects.toThrow('skill_selection_ineligible')
  await act(async () => {
    request = applySkillListViewerAction({
      kind: 'select',
      id: secondSkill.id,
      selected: true,
      range: true
    })
  })
  await expect(request).resolves.toMatchObject({ selectedSkillIds: [skill.id, secondSkill.id] })
})

it('rejects an acknowledgement when the same runtime ID belongs to a new target object', async () => {
  let finish!: () => void
  const writeClipboardText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { ui: { writeClipboardText } }
  })
  const props = {
    skills: [skill],
    allSkills: [skill],
    local: false,
    agentByRootPath: new Map<string, string>(),
    selectedIds: new Set<string>(),
    selectionMode: null,
    deleteSupported: true,
    deleteUnsupportedReason: null,
    onSelectedChange: vi.fn(),
    onSelectResults: vi.fn(),
    onShare: vi.fn(),
    onDelete: vi.fn()
  }
  const view = render(
    <TooltipProvider>
      <SkillsList {...props} target={{ kind: 'environment', environmentId: 'peer-1' }} />
    </TooltipProvider>
  )
  let request: ReturnType<typeof applySkillListViewerAction> | undefined
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail', id: skill.id })
  })
  await request
  let failed: unknown
  await act(async () => {
    request = applySkillListViewerAction({ kind: 'detail-action', action: 'copy-path' })
    request.catch((error: unknown) => {
      failed = error
    })
  })
  await act(async () => {
    view.rerender(
      <TooltipProvider>
        <SkillsList {...props} target={{ kind: 'environment', environmentId: 'peer-1' }} />
      </TooltipProvider>
    )
  })
  expect(failed).toBeInstanceOf(Error)
  await expect(request).rejects.toThrow('viewer_target_changed')
  await act(async () => {
    finish()
  })
})
