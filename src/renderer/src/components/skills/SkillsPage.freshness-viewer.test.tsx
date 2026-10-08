// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useAppStore } from '@/store'
import { applySkillsViewerRequest as applySkillsViewerAction } from '@/runtime/skills-viewer-request'
import { SkillFreshnessUpdateDialog } from './SkillFreshnessUpdateDialog'
import { eligibleInventory } from './skill-freshness-dialog-test-fixture'
import { _resetSkillUpdateRunStore } from './skill-update-run-store'
import { consumeSkillFreshnessUpdateDialogRequest } from './skill-freshness-update-dialog'
import SkillsPage from './SkillsPage'
import { detectionApi, installApi } from './skill-install-dialog-test-fixture'
import { skill, preview } from './skill-share-dialog-test-fixture'

afterEach(() => {
  cleanup()
  _resetSkillUpdateRunStore()
  consumeSkillFreshnessUpdateDialogRequest()
  useAppStore.setState({
    settings: null,
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: false,
    pendingSkillShareId: null
  })
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
vi.mock('@/hooks/useSkillFreshness', () => ({
  useSkillFreshness: () => ({
    inventory: eligibleInventory(),
    loading: false,
    error: null,
    refresh: async () => undefined
  })
}))
it('routes the global freshness dialog through skills and fences underlying mutations', async () => {
  const skills = installApi(vi.fn())
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        ...skills,
        getUpdateRun: async () => ({ state: 'idle' }),
        onUpdateRun: () => () => undefined,
        startUpdateRun: vi.fn().mockResolvedValue({ started: true }),
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
          <SkillFreshnessUpdateDialog />
        </ConfirmationDialogProvider>
      </TooltipProvider>
    )
  })
  let request: ReturnType<typeof applySkillsViewerAction> | undefined
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'freshness-form',
      action: { kind: 'open', value: true }
    })
  })
  await expect(request).resolves.toMatchObject({
    freshnessOpen: true,
    freshness: { open: true, executionHost: 'local' }
  })
  await expect(applySkillsViewerAction({ kind: 'filter-clear' })).rejects.toThrow(
    'viewer_modal_open'
  )
  await act(async () => {
    request = applySkillsViewerAction({ kind: 'freshness-form', action: { kind: 'update' } })
  })
  await expect(request).resolves.toMatchObject({
    freshness: { accepted: true, run: { state: 'idle' } }
  })
  await act(async () => {
    request = applySkillsViewerAction({
      kind: 'freshness-form',
      action: { kind: 'open', value: false }
    })
  })
  await expect(request).resolves.toMatchObject({ freshnessOpen: false })
})
