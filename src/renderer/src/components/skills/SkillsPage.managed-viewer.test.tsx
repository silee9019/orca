// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useAppStore } from '@/store'
import { applySkillsViewerAction } from '@/runtime/skills-viewer-controller'
import SkillsPage from './SkillsPage'
import { detectionApi, installApi } from './skill-install-dialog-test-fixture'
import { install, version, packageDetails, skillsApi } from './skill-managed-install-test-fixture'

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
it('routes managed group actions and opens only its loaded share in the machine installer', async () => {
  const versions = [version('ver_1', '2026-08-11T00:00:00Z')]
  const management = skillsApi(install('ver_1'), versions, {
    ...packageDetails(versions),
    management: {
      shares: [
        {
          id: 'share_fixture',
          url: 'https://app.orca.dev/skills/share/share_fixture',
          createdAt: '2026-08-11T00:00:00Z'
        }
      ]
    }
  })
  const skills = installApi(vi.fn())
  skills.resolveShare.mockResolvedValue({
    status: 'ok',
    value: { id: 'share_fixture', version: versions[0] }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        ...skills,
        ...management,
        discover: async () => ({ skills: [], sources: [], scannedAt: 1 }),
        deleteSupported: async () => true,
        listOwnedShares: async () => ({ status: 'ok', value: [] })
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
    request = applySkillsViewerAction({ kind: 'management', open: true })
  })
  await expect(request).resolves.toMatchObject({ managementOpen: true })
  const loaded = await applySkillsViewerAction({ kind: 'managed-form', action: { kind: 'get' } })
  const key = loaded.managed?.groups[0]?.key
  if (!key) {
    throw new Error('Expected managed fixture')
  }
  await expect(
    applySkillsViewerAction({ kind: 'managed-form', action: { kind: 'send-to-machine' } })
  ).rejects.toThrow('managed_skill_share_unavailable')
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'managed-form', action: { kind: 'select', key } })
  })
  await expect(request).resolves.toMatchObject({
    managed: { canSendToMachine: true, selectedKey: key }
  })
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'managed-form', action: { kind: 'send-to-machine' } })
  })
  await expect(request).resolves.toMatchObject({ managementOpen: false, managed: { closed: true } })
  expect(skills.resolveShare).toHaveBeenCalledWith('share_fixture')
  expect(management.installPackageVersion).not.toHaveBeenCalled()
  expect(management.revokeShare).not.toHaveBeenCalled()
  const installer = await applySkillsViewerAction({ kind: 'get' })
  expect(installer.installOpen).toBe(true)
})
