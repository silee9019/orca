// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import type { AppState } from '@/store/types'
import { applyVmPaneViewerAction } from './vm-pane-viewer-actions'
import { applyVmRuntimeViewerAction } from './vm-runtime-viewer-actions'
import { applyVoiceDialogViewerAction } from './voice-dialog-viewer-actions'
import { applyBrowserSettingsViewerAction } from './browser-settings-viewer-actions'
import { applyVoiceViewerRequest } from './voice-viewer-bridge'
const state = vi.hoisted(() => ({
  activeModal: 'none',
  persistedUIReady: true,
  settings: {},
  openSettingsTarget: vi.fn(),
  openSettingsPage: vi.fn(),
  openModal: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
afterEach(() => {
  state.activeModal = 'none'
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
const cases: { name: string; run: () => Promise<unknown>; boundary: string }[] = [
  {
    name: 'VM pane',
    run: () => applyVmPaneViewerAction('vm-copy-prompt', Date.now()),
    boundary: 'vm_pane_unavailable'
  },
  {
    name: 'VM runtime',
    run: () =>
      applyVmRuntimeViewerAction({ viewer: 'host', operation: 'vm-runtimes-refresh' }, Date.now()),
    boundary: 'vm_runtime_section_unavailable'
  },
  {
    name: 'VM confirmation dialog',
    run: () =>
      applyVoiceDialogViewerAction(
        { viewer: 'host', operation: 'vm-stop-confirm-open', runtimeId: 'fixture-runtime' },
        Date.now()
      ),
    boundary: 'vm_runtime_section_unavailable'
  },
  {
    name: 'model confirmation dialog',
    run: () =>
      applyVoiceDialogViewerAction(
        {
          viewer: 'host',
          operation: 'model-delete-start',
          modelId: 'fixture-model',
          confirmation: 'fixture-model'
        },
        Date.now()
      ),
    boundary: 'voice_pane_not_rendered'
  },
  {
    name: 'browser settings',
    run: () => applyBrowserSettingsViewerAction({ action: 'status' }, Date.now(), 'local'),
    boundary: 'browser_settings_pane_not_rendered'
  }
]
it.each(cases)(
  'allows canonical none in $name while refusing an actual busy modal before UI effects',
  async ({ run, boundary }) => {
    const canonical: AppState['activeModal'] = 'none'
    state.activeModal = canonical
    state.settings = { ...getDefaultSettings('/fixture'), experimentalEphemeralVms: true }
    await expect(run()).rejects.toThrow(boundary)
    expect(state.openSettingsTarget).toHaveBeenCalledOnce()
    state.openSettingsTarget.mockClear()
    state.activeModal = 'feature-tips'
    await expect(run()).rejects.toThrow('viewer_modal_busy')
    expect(state.openSettingsTarget).not.toHaveBeenCalled()
  }
)
it('allows canonical none for composer and fences a replacement modal after catalog await', async () => {
  state.settings = { ...getDefaultSettings('/fixture'), experimentalEphemeralVms: true }
  const listRecipes = vi.fn(async () => ({ status: 'ok', recipes: [{ id: 'recipe-fixture' }] }))
  vi.stubGlobal('window', { api: { ephemeralVm: { listRecipes } } })
  const marker = document.createElement('div')
  marker.setAttribute('data-vm-workspace-composer', '')
  document.body.append(marker)
  const command = {
    viewer: 'host',
    operation: 'vm-composer',
    repoId: 'fixture-repo',
    recipeId: 'recipe-fixture'
  } as const
  await expect(
    applyVoiceViewerRequest({ id: 'fixture', expiresAt: Date.now() + 1000, command })
  ).resolves.toMatchObject({ applied: true })
  expect(state.openModal).toHaveBeenCalledOnce()
  state.openModal.mockClear()
  listRecipes.mockClear()
  listRecipes.mockImplementation(async () => {
    state.activeModal = 'feature-tips'
    return { status: 'ok', recipes: [{ id: 'recipe-fixture' }] }
  })
  await expect(
    applyVoiceViewerRequest({ id: 'race', expiresAt: Date.now() + 1000, command })
  ).rejects.toThrow('viewer_modal_busy')
  expect(listRecipes).toHaveBeenCalledOnce()
  expect(state.openModal).not.toHaveBeenCalled()
})
