// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applySkillListViewerAction } from '@/runtime/skill-list-viewer-controller'
import { SkillsList } from './SkillsList'
import { skill } from './skill-share-dialog-test-fixture'

afterEach(cleanup)

it('requires the actual visible, eligible, supported and unlocked deletion control', async () => {
  const onDelete = vi.fn().mockResolvedValue(true)
  const props = {
    skills: [skill],
    allSkills: [skill],
    local: true,
    target: { kind: 'local' } as const,
    agentByRootPath: new Map<string, string>(),
    selectedIds: new Set<string>(),
    selectionMode: null,
    deleteSupported: true,
    deleteUnsupportedReason: null,
    onSelectedChange: vi.fn(),
    onSelectResults: vi.fn(),
    onShare: vi.fn(),
    onDelete
  }
  const view = render(
    <TooltipProvider>
      <SkillsList {...props} />
    </TooltipProvider>
  )
  await expect(applySkillListViewerAction({ kind: 'delete', id: 'missing' })).rejects.toThrow(
    'skill_not_visible'
  )
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} deleteSupported={false} />
    </TooltipProvider>
  )
  await expect(applySkillListViewerAction({ kind: 'delete', id: skill.id })).rejects.toThrow(
    'skill_delete_unsupported'
  )
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} target={null} />
    </TooltipProvider>
  )
  await expect(applySkillListViewerAction({ kind: 'delete', id: skill.id })).rejects.toThrow(
    'skill_owner_unavailable'
  )
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} locked />
    </TooltipProvider>
  )
  await expect(applySkillListViewerAction({ kind: 'delete', id: skill.id })).rejects.toThrow(
    'viewer_modal_open'
  )
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} busy />
    </TooltipProvider>
  )
  await expect(applySkillListViewerAction({ kind: 'delete', id: skill.id })).rejects.toThrow(
    'viewer_busy'
  )
  const bundled = { ...skill, sourceKind: 'bundled' as const }
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} skills={[bundled]} />
    </TooltipProvider>
  )
  await expect(applySkillListViewerAction({ kind: 'delete', id: skill.id })).rejects.toThrow(
    'skill_selection_ineligible'
  )
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} />
    </TooltipProvider>
  )
  await expect(
    applySkillListViewerAction({ kind: 'detail-action', action: 'delete' })
  ).rejects.toThrow('skill_detail_unavailable')
  let opened: ReturnType<typeof applySkillListViewerAction> | undefined
  await act(async () => {
    opened = applySkillListViewerAction({ kind: 'detail', id: skill.id })
  })
  await opened
  await expect(applySkillListViewerAction({ kind: 'delete', id: skill.id })).rejects.toThrow(
    'viewer_modal_open'
  )
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} skills={[]} />
    </TooltipProvider>
  )
  await expect(
    applySkillListViewerAction({ kind: 'detail-action', action: 'delete' })
  ).rejects.toThrow('skill_not_visible')
  expect(onDelete).not.toHaveBeenCalled()
  view.rerender(
    <TooltipProvider>
      <SkillsList {...props} target={{ kind: 'environment', environmentId: 'peer-1' }} />
    </TooltipProvider>
  )
  await expect(
    applySkillListViewerAction({ kind: 'detail-action', action: 'delete' })
  ).rejects.toThrow('skill_detail_unavailable')
  expect(onDelete).not.toHaveBeenCalled()
})
