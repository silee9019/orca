// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applySkillListViewerAction } from '@/runtime/skill-list-viewer-controller'
import { SkillsList } from './SkillsList'
import { skill } from './skill-share-dialog-test-fixture'

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'api')
})

it.each(['dropdown', 'context'] as const)(
  'reuses the actual %s row copy and reveal effects',
  async (menu) => {
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    const openInFileManager = vi.fn().mockResolvedValue({ ok: false, reason: 'fixture' })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: { writeClipboardText },
        shell: { openInFileManager }
      }
    })
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
      onDelete: vi.fn()
    }
    const view = render(
      <TooltipProvider>
        <SkillsList {...props} />
      </TooltipProvider>
    )
    const openMenu = async () => {
      if (menu === 'dropdown') {
        fireEvent.pointerDown(screen.getByRole('button', { name: `Actions for ${skill.name}` }), {
          button: 0,
          ctrlKey: false
        })
      } else {
        fireEvent.contextMenu(screen.getByRole('option'), { clientX: 5, clientY: 5 })
      }
      await screen.findByRole('menuitem', { name: 'Copy path' })
    }
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))
    expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith(skill.skillFilePath)
    let request: ReturnType<typeof applySkillListViewerAction> | undefined
    await act(async () => {
      request = applySkillListViewerAction({ kind: 'copy-path', id: skill.id })
    })
    await request
    expect(writeClipboardText).toHaveBeenNthCalledWith(2, skill.skillFilePath)
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reveal file' }))
    expect(openInFileManager).toHaveBeenCalledExactlyOnceWith(skill.skillFilePath)
    await act(async () => {
      request = applySkillListViewerAction({ kind: 'reveal', id: skill.id })
    })
    await expect(request).resolves.toMatchObject({ revealResult: { ok: false, reason: 'fixture' } })
    expect(openInFileManager).toHaveBeenNthCalledWith(2, skill.skillFilePath)
    await expect(applySkillListViewerAction({ kind: 'copy-path', id: 'missing' })).rejects.toThrow(
      'skill_not_visible'
    )
    view.rerender(
      <TooltipProvider>
        <SkillsList {...props} local={false} />
      </TooltipProvider>
    )
    await expect(applySkillListViewerAction({ kind: 'reveal', id: skill.id })).rejects.toThrow(
      'skill_reveal_remote_unsupported'
    )
    expect(openInFileManager).toHaveBeenCalledTimes(2)
  }
)
