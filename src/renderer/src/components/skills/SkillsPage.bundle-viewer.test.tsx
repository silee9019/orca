// @vitest-environment happy-dom
import type { SkillBundleInstallResult } from '../../../../shared/skill-bundle-install-contract'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useAppStore } from '@/store'
import { applySkillsViewerAction } from '@/runtime/skills-viewer-controller'
import SkillsPage from './SkillsPage'
import { bundleVersion, detectionApi, installApi } from './skill-install-dialog-test-fixture'

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
it('acknowledges bundle selection and the owning page closing its actual dialog', async () => {
  const skills = installApi(vi.fn())
  let finish!: (value: { status: 'ok'; value: SkillBundleInstallResult }) => void
  const installing = new Promise<{ status: 'ok'; value: SkillBundleInstallResult }>((resolve) => {
    finish = resolve
  })
  skills.previewBundleInstall.mockResolvedValue({
    status: 'ok',
    value: {
      packageId: 'pkg_1',
      versionId: 'ver_1',
      bundleDigest: 'c'.repeat(64),
      destinationIdentity: 'local:global',
      skills: [{ id: 'skill-beta', name: 'beta', digest: 'a'.repeat(64), currentState: 'missing' }]
    }
  })
  skills.installBundleShare.mockReturnValue(installing)

  skills.resolveShare.mockResolvedValue({
    status: 'ok',
    value: { id: 'share_1', version: bundleVersion() }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        ...skills,
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
    pendingSkillShareId: 'share_1'
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
      kind: 'bundle-form',
      action: { kind: 'select', id: 'skill-alpha', selected: false }
    })
  })
  await expect(request).resolves.toMatchObject({
    installOpen: true,
    bundle: { selectedSkillIds: ['skill-beta'] }
  })
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'bundle-form', action: { kind: 'install' } })
    request.catch(() => {})
  })
  await expect(applySkillsViewerAction({ kind: 'install', open: false })).rejects.toThrow(
    'viewer_busy'
  )
  let cancellation: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    cancellation = applySkillsViewerAction({ kind: 'bundle-form', action: { kind: 'cancel' } })
  })
  await expect(cancellation).resolves.toMatchObject({ bundle: { busy: true } })
  const active = await applySkillsViewerAction({ kind: 'bundle-form', action: { kind: 'get' } })
  const operationId = active.bundle?.activeOperationId
  if (!operationId) {
    throw new Error('Expected active bundle operation')
  }
  await act(async () => {
    finish({
      status: 'ok',
      value: {
        operationId,
        packageId: 'pkg_1',
        versionId: 'ver_1',
        bundleDigest: 'c'.repeat(64),
        status: 'cancelled',
        skills: []
      }
    })
  })
  await expect(request).resolves.toMatchObject({
    installOpen: true,
    bundle: { busy: false, result: { status: 'cancelled' } }
  })

  await act(async () => {
    request = applySkillsViewerAction({ kind: 'bundle-form', action: { kind: 'close' } })
  })
  await expect(request).resolves.toMatchObject({ installOpen: false, bundle: { closed: true } })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
