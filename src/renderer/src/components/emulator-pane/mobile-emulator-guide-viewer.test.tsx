import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { MobileEmulatorAgentSetupGuide } from './MobileEmulatorAgentSetupGuide'
import { applyEmulatorConnectionsViewerRequest } from '@/runtime/emulator-connections-viewer-controller'
import type { ConnectionsViewerCommand } from '../../../../shared/rpc-contract/connections-viewer-params'

vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: () => <div data-testid="install-terminal-fixture" />
}))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({ terminalShellOverride: undefined })
}))
const setup = {
  cliSkillError: null,
  cliSkillInstalled: false,
  cliSkillLoading: false,
  recheckSetup: vi.fn(async () => {}),
  refreshCliSkill: vi.fn(async () => false),
  setupComplete: false,
  setupRechecking: false,
  statusReady: true
}
const write = vi.fn(async () => {})
async function invoke(command: ConnectionsViewerCommand) {
  let pending: ReturnType<typeof applyEmulatorConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applyEmulatorConnectionsViewerRequest({
      id: 'guide',
      expiresAt: Date.now() + 300,
      command
    })
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing_request')
  }
  return pending
}
beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState(useAppStore.getInitialState(), true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        set: write,
        get: vi.fn(async () => ({
          mobileEmulatorAgentSetupDismissed:
            useAppStore.getState().mobileEmulatorAgentSetupDismissed
        }))
      }
    }
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(useAppStore.getInitialState(), true)
})
it('pairs actual guide disclosure and settings button with typed navigation for the selected worktree', async () => {
  render(
    <TooltipProvider>
      <MobileEmulatorAgentSetupGuide setup={setup} worktreeId="guide-worktree" />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
  expect(screen.getByRole('button', { name: 'Hide' })).toHaveAttribute('aria-expanded', 'true')
  await expect(
    invoke({
      viewerId: 7,
      operation: 'emulator.guide-expand',
      worktreeId: 'guide-worktree',
      open: false
    })
  ).resolves.toMatchObject({ applied: true, state: { expanded: false } })
  expect(screen.getByRole('button', { name: 'Set up' })).toHaveAttribute('aria-expanded', 'false')
  await invoke({
    viewerId: 7,
    operation: 'emulator.guide-expand',
    worktreeId: 'guide-worktree',
    open: true
  })
  fireEvent.click(screen.getByRole('button', { name: 'Open full setup in Settings' }))
  expect(useAppStore.getState()).toMatchObject({
    activeView: 'settings',
    settingsNavigationTarget: { pane: 'mobile-emulator' }
  })
  useAppStore.setState({ activeView: 'skills', settingsNavigationTarget: null })
  await expect(
    invoke({ viewerId: 7, operation: 'emulator.guide-settings', worktreeId: 'guide-worktree' })
  ).resolves.toMatchObject({ applied: true, state: { settingsOpen: true } })
})
it.each([false, true])(
  'pairs the actual incomplete/complete dismiss button with persisted typed dismissal: %s',
  async (complete) => {
    render(
      <MobileEmulatorAgentSetupGuide
        setup={{ ...setup, setupComplete: complete }}
        worktreeId="guide-worktree"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: complete ? 'Done' : 'Not now' }))
    expect(useAppStore.getState().mobileEmulatorAgentSetupDismissed).toBe(true)
    useAppStore.setState({ mobileEmulatorAgentSetupDismissed: false })
    await expect(
      invoke({ viewerId: 7, operation: 'emulator.guide-dismiss', worktreeId: 'guide-worktree' })
    ).resolves.toMatchObject({ applied: true, persisted: true, state: { guideDismissed: true } })
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({ mobileEmulatorAgentSetupDismissed: true })
    )
  }
)
it('does not acknowledge dismissal persistence after the guide owner unmounts', async () => {
  const mounted = render(
    <MobileEmulatorAgentSetupGuide setup={setup} worktreeId="guide-worktree" />
  )
  let finish = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const read = window.api.ui.get
  vi.mocked(read).mockImplementationOnce(async () => {
    await gate
    return read()
  })
  let pending: ReturnType<typeof applyEmulatorConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applyEmulatorConnectionsViewerRequest({
      id: 'unmount',
      expiresAt: Date.now() + 300,
      command: {
        viewerId: 7,
        operation: 'emulator.guide-dismiss',
        worktreeId: 'guide-worktree'
      }
    })
  })
  await act(async () => {
    mounted.unmount()
    finish()
  })
  await expect(pending).resolves.toMatchObject({ applied: false })
})

it('reuses the actual guide skill native install/recheck metadata and typed recheck owner', async () => {
  useAppStore.setState({ persistedUIReady: true })
  render(
    <TooltipProvider>
      <MobileEmulatorAgentSetupGuide setup={setup} worktreeId="guide-worktree" />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
  })
  expect(screen.getByTestId('install-terminal-fixture')).toBeInTheDocument()
  expect(
    useAppStore.getState().featureInteractions['mobile-emulator-agent-setup']?.interactionCount
  ).toBe(1)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  })
  expect(setup.recheckSetup).toHaveBeenCalledOnce()
  expect(
    await invoke({ viewerId: 7, operation: 'emulator.guide-recheck', worktreeId: 'guide-worktree' })
  ).toMatchObject({
    applied: true,
    persisted: null,
    state: { skillReady: false, skillChecking: false }
  })
  expect(setup.recheckSetup).toHaveBeenCalledTimes(2)
  expect(
    useAppStore.getState().featureInteractions['mobile-emulator-agent-setup']?.interactionCount
  ).toBe(3)
})
it('refuses guide recheck when its setup owner is loading or unmounted', async () => {
  const owner = render(
    <MobileEmulatorAgentSetupGuide
      setup={{ ...setup, cliSkillLoading: true }}
      worktreeId="guide-worktree"
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
  expect(
    await invoke({ viewerId: 7, operation: 'emulator.guide-recheck', worktreeId: 'guide-worktree' })
  ).toMatchObject({ applied: false })
  expect(setup.recheckSetup).not.toHaveBeenCalled()
  owner.unmount()
  await expect(
    invoke({ viewerId: 7, operation: 'emulator.guide-recheck', worktreeId: 'guide-worktree' })
  ).rejects.toThrow('connections_surface_unavailable')
})
it('shares the native recheck guard and rejects a late result after guide unmount', async () => {
  let finish = () => {}
  setup.recheckSetup.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const owner = render(<MobileEmulatorAgentSetupGuide setup={setup} worktreeId="guide-worktree" />)
  fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
  let pending: ReturnType<typeof applyEmulatorConnectionsViewerRequest> | undefined
  await act(async () => {
    pending = applyEmulatorConnectionsViewerRequest({
      id: 'late-skill',
      expiresAt: Date.now() + 1000,
      command: { viewerId: 7, operation: 'emulator.guide-recheck', worktreeId: 'guide-worktree' }
    })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  })
  expect(setup.recheckSetup).toHaveBeenCalledOnce()
  owner.unmount()
  await act(async () => {
    finish()
  })
  await expect(pending).resolves.toMatchObject({ applied: false })
})

it('acknowledges successful skill readiness when only the completed guide steps disappear', async () => {
  function Guide() {
    const [ready, setReady] = useState(false)
    return (
      <MobileEmulatorAgentSetupGuide
        worktreeId="guide-worktree"
        setup={{
          ...setup,
          cliSkillInstalled: ready,
          setupComplete: ready,
          recheckSetup: async () => {
            setReady(true)
          }
        }}
      />
    )
  }
  render(<Guide />)
  fireEvent.click(screen.getByRole('button', { name: 'Set up' }))
  expect(
    await invoke({ viewerId: 7, operation: 'emulator.guide-recheck', worktreeId: 'guide-worktree' })
  ).toMatchObject({ applied: true, state: { skillReady: true, skillChecking: false } })
  expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Re-check' })).toBeNull()
})
