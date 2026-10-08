// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
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
it('opens the selected eligible skills and routes notes publication and link management through the actual dialog', async () => {
  const skills = installApi(vi.fn())
  const publishShare = vi.fn().mockResolvedValue({
    status: 'ok',
    value: { share: { url: 'https://app.orca.dev/skills/share/fixture' } }
  })
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
        publishShare,
        releaseShare: vi.fn().mockResolvedValue(undefined),
        cancelShare: vi.fn().mockResolvedValue(undefined),
        onShareProgress: vi.fn(() => () => undefined)
      },
      orcaProfiles: {
        authStatus: vi.fn().mockResolvedValue({ cloud: { email: 'fixture@example.invalid' } })
      },
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
  const settingsTarget = vi.spyOn(useAppStore.getState(), 'openSettingsTarget')
  const openSettings = vi.spyOn(useAppStore.getState(), 'openSettingsPage')
  await act(async () => {
    render(
      <TooltipProvider>
        <ConfirmationDialogProvider>
          <SkillsPage />
        </ConfirmationDialogProvider>
      </TooltipProvider>
    )
  })
  await expect(
    applySkillsViewerAction({ kind: 'share', open: true, ids: ['missing'] })
  ).rejects.toThrow('skill_selection_ineligible')
  let request: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'mode', value: 'share' })
  })
  await request
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'select', ids: [skill.id], selected: true })
  })
  await request
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'share', open: true })
  })
  await expect(request).resolves.toMatchObject({ shareOpen: true, sharedSkillIds: [skill.id] })
  await waitFor(async () => {
    expect(
      (await applySkillsViewerAction({ kind: 'share-form', action: { kind: 'get' } })).share
        ?.preparing
    ).toBe(false)
  })
  await expect(applySkillsViewerAction({ kind: 'filter-clear' })).rejects.toThrow(
    'viewer_modal_open'
  )
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'share-form',
      action: { kind: 'release-notes', value: 'fixture notes' }
    })
  })
  await request
  let finishPublish!: (value: unknown) => void
  publishShare.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishPublish = resolve
      })
  )
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'share-form', action: { kind: 'publish' } })
  })
  await expect(applySkillsViewerAction({ kind: 'share', open: false })).rejects.toThrow(
    'viewer_busy'
  )
  await act(async () => {
    finishPublish({
      status: 'ok',
      value: { share: { url: 'https://app.orca.dev/skills/share/fixture' } }
    })
  })
  await expect(request).resolves.toMatchObject({
    shareOpen: true,
    share: { shareUrl: 'https://app.orca.dev/skills/share/fixture' }
  })
  expect(publishShare).toHaveBeenCalledExactlyOnceWith({
    preparationId: preview.preparationId,
    releaseNotes: 'fixture notes'
  })
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'share-form', action: { kind: 'manage-links' } })
  })
  await expect(request).resolves.toMatchObject({
    shareOpen: false,
    selectionMode: null,
    share: { closed: true }
  })
  expect(settingsTarget).toHaveBeenCalledExactlyOnceWith({ pane: 'share-skills', repoId: null })
  expect(openSettings).toHaveBeenCalledOnce()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'share', open: true, ids: [skill.id] })
  })
  await expect(request).resolves.toMatchObject({ shareOpen: true, sharedSkillIds: [skill.id] })
  await waitFor(async () => {
    expect(
      (await applySkillsViewerAction({ kind: 'share-form', action: { kind: 'get' } })).share
        ?.preparing
    ).toBe(false)
  })
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'share', open: false })
  })
  await expect(request).resolves.toMatchObject({ shareOpen: false, share: { closed: true } })
})
