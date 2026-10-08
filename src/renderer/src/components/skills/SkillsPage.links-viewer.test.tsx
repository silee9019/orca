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
const link = {
  id: 'shr_fixture',
  packageId: 'pkg_fixture',
  url: 'https://example.invalid/share/fixture',
  name: 'fixture',
  description: '',
  createdAt: '2026-10-08T00:00:00Z'
}
it('routes only the visible shared view and waits for link removal', async () => {
  const skills = installApi(vi.fn())
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        ...skills,
        discover: async () => ({ skills: [skill], sources: [], scannedAt: 1 }),
        deleteSupported: async () => true,
        listOwnedShares: async () => ({ status: 'ok', value: [link] }),
        revokeShare: vi.fn().mockResolvedValue({ status: 'ok', value: undefined }),
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
  await expect(
    applySkillsViewerAction({ kind: 'links-form', action: { kind: 'get' } })
  ).rejects.toThrow('viewer_unavailable')
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'view', value: 'shared' })
  })
  await request
  await expect(
    applySkillsViewerAction({ kind: 'links-form', action: { kind: 'get' } })
  ).resolves.toMatchObject({ links: { visibleShareIds: [link.id] } })
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'links-form',
      action: { kind: 'confirm', id: link.id, value: 'revoke' }
    })
  })
  await expect(request).resolves.toMatchObject({ links: { row: { confirming: 'revoke' } } })
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'links-form',
      action: { kind: 'execute', id: link.id, operation: 'revoke' }
    })
  })
  await expect(request).resolves.toMatchObject({
    view: 'shared',
    links: { visibleShareIds: [], row: { completed: true } }
  })
})
