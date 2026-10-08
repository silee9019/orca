// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useAppStore } from '@/store'
import { applySkillsViewerAction } from '@/runtime/skills-viewer-controller'
import SkillsPage from './SkillsPage'
import { detectionApi, installApi } from './skill-install-dialog-test-fixture'
import { skill, preview } from './skill-share-dialog-test-fixture'

afterEach(() => {
  cleanup()
  useAppStore.setState({
    settings: null,
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: false,
    pendingSkillShareId: null
  })
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it('routes the visible detail and closes it when sharing, while fencing the underlying page', async () => {
  const skills = installApi(vi.fn())
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        ...skills,
        discover: async () => ({ skills: [skill], sources: [], scannedAt: 1 }),
        deleteSupported: async () => true,
        listOwnedShares: async () => ({ status: 'ok', value: [] }),
        listManagedInstalls: async () => ({ status: 'ok', value: [] }),
        prepareShare: vi.fn().mockResolvedValue(preview),
        releaseShare: vi.fn().mockResolvedValue(undefined),
        onShareProgress: vi.fn(() => () => undefined)
      },
      ui: { writeClipboardText },
      orcaProfiles: { authStatus: vi.fn().mockResolvedValue({ cloud: null }) },
      preflight: detectionApi(['codex'])
    }
  })
  useAppStore.setState({
    settings: null,
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: true,
    pendingSkillShareId: null,
    sshTargetLabels: new Map(),
    sshConnectionStates: new Map()
  })
  await act(async () => {
    render(
      <TooltipProvider>
        <ConfirmationDialogProvider>
          <SkillsPage />
        </ConfirmationDialogProvider>
      </TooltipProvider>
    )
  })
  let request: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'list-form',
      action: { kind: 'detail', id: skill.id }
    })
  })
  await expect(request).resolves.toMatchObject({
    detailOpen: true,
    list: { detailSkill: { id: skill.id } }
  })
  await expect(applySkillsViewerAction({ kind: 'filter-clear' })).rejects.toThrow(
    'viewer_modal_open'
  )
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'list-form',
      action: { kind: 'detail-action', action: 'copy-path' }
    })
  })
  await request
  expect(writeClipboardText).toHaveBeenCalledExactlyOnceWith(skill.skillFilePath)
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'list-form',
      action: { kind: 'detail-action', action: 'share' }
    })
  })
  await expect(request).resolves.toMatchObject({
    detailOpen: false,
    shareOpen: true,
    list: { detailSkill: null }
  })
  await expect(
    applySkillsViewerAction({ kind: 'list-form', action: { kind: 'focus', value: 'first' } })
  ).rejects.toThrow('viewer_modal_open')
})
