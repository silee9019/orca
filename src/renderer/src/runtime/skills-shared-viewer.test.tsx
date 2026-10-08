// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import SkillsPage from '@/components/skills/SkillsPage'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { createGlobalSettingsFixture } from '../../../shared/global-settings-test-fixture'
import { applySkillsSharedViewerRequest } from './skills-shared-viewer'
const discover = vi.fn(),
  list = vi.fn()
beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  useAppStore.setState({
    settings: createGlobalSettingsFixture(),
    runtimeEnvironmentCatalogSettled: true,
    orcaProfileAuthStatus: {
      activeProfileId: 'fixture',
      configured: true,
      state: 'connected',
      persistence: 'memory-only'
    }
  })
  discover.mockResolvedValue({ skills: [], sources: [], scannedAt: 1 })
  list.mockResolvedValue({ status: 'ok', value: [] })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      skills: {
        discover,
        listOwnedShares: list,
        deleteSupported: async () => true,
        onInstallProgress: () => () => {}
      },
      runtimeEnvironments: { call: vi.fn() }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
  vi.clearAllMocks()
})
it('reuses the existing view action and waits for the actual Skills page to consume the shared-view intent', async () => {
  const previous = useAppStore.getState().activeView
  render(
    <TooltipProvider>
      <ConfirmationDialogProvider>
        <SkillsPage />
      </ConfirmationDialogProvider>
    </TooltipProvider>
  )
  let pending
  await act(async () => {
    pending = applySkillsSharedViewerRequest({
      id: 'fixture',
      expiresAt: Date.now() + 1000,
      command: { viewerId: 7, operation: 'skills.shared-open' }
    })
  })
  expect(await pending).toMatchObject({
    viewerId: 7,
    applied: true,
    persisted: null,
    state: { activeView: 'skills', sharedViewApplied: true }
  })
  expect(useAppStore.getState().previousViewBeforeSkills).toBe(previous)
  expect(useAppStore.getState().pendingSkillsSharedView).toBe(false)
  expect(
    screen.getByText('No active links. Publish a skill bundle from Skills to create one.')
  ).toBeVisible()
})
it('rejects an expired request before changing the viewer store', async () => {
  const previous = useAppStore.getState().activeView
  await expect(
    applySkillsSharedViewerRequest({
      id: 'expired',
      expiresAt: Date.now() - 1,
      command: { viewerId: 7, operation: 'skills.shared-open' }
    })
  ).rejects.toThrow('request_expired')
  expect(useAppStore.getState().activeView).toBe(previous)
  expect(useAppStore.getState().pendingSkillsSharedView).toBe(false)
})

it('does not acknowledge an unconsumed shared-view intent as applied', async () => {
  await expect(
    applySkillsSharedViewerRequest({
      id: 'unconsumed',
      expiresAt: Date.now() + 30,
      command: { viewerId: 7, operation: 'skills.shared-open' }
    })
  ).rejects.toThrow('viewer_not_applied')
  expect(useAppStore.getState().pendingSkillsSharedView).toBe(true)
})

it('preserves the original signed-in settings entry precondition', async () => {
  useAppStore.setState({ orcaProfileAuthStatus: null })
  const previous = useAppStore.getState().activeView
  await expect(
    applySkillsSharedViewerRequest({
      id: 'signed-out',
      expiresAt: Date.now() + 1000,
      command: { viewerId: 7, operation: 'skills.shared-open' }
    })
  ).rejects.toThrow('skills_shared_view_unavailable')
  expect(useAppStore.getState().activeView).toBe(previous)
})

it('does not expose the desktop-only settings navigation in a web viewer', async () => {
  Reflect.set(window, '__ORCA_WEB_CLIENT__', true)
  const previous = useAppStore.getState().activeView
  try {
    await expect(
      applySkillsSharedViewerRequest({
        id: 'web',
        expiresAt: Date.now() + 1000,
        command: { viewerId: 7, operation: 'skills.shared-open' }
      })
    ).rejects.toThrow('skills_shared_view_unavailable')
    expect(useAppStore.getState().activeView).toBe(previous)
  } finally {
    Reflect.deleteProperty(window, '__ORCA_WEB_CLIENT__')
  }
})
