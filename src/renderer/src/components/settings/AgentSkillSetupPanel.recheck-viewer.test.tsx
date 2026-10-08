// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { AgentSkillSetupPanel } from './AgentSkillSetupPanel'
import { TooltipProvider } from '../ui/tooltip'
import { OrchestrationPane } from './OrchestrationPane'
import { ComputerUseSkillSetupPanel } from './ComputerUseSkillSetupPanel'
import { EphemeralVmsPane } from './EphemeralVmsPane'
import { CliSection } from './CliSection'
import { LinearAgentSkillPane } from './LinearAgentSkillPane'
import { TaskSourceLinearSetup } from './TaskSourceLinearSetup'
import { OrchestrationSetupCard } from './OrchestrationSetupCard'
import type { InstalledAgentSkillState } from '@/hooks/useInstalledAgentSkills'
import { getDefaultSettings } from '../../../../shared/constants'
import { applySkillsViewerRequest as apply } from '../../runtime/skills-viewer-request'
import type { AgentSkillSetupPanelProps } from './agent-skill-setup-panel-props'
const provider = vi.hoisted(() => ({
  refresh: vi.fn(async () => undefined),
  surfaces: vi.fn(),
  freshness: vi.fn(),
  persistUi: vi.fn(async () => undefined),
  installed: false,
  disabled: ''
}))
vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  GLOBAL_AGENT_SKILL_SOURCE_KINDS: ['home'],
  hasInstalledAgentSkill: () => false,
  notifyInstalledAgentSkillsRefreshed: provider.surfaces,
  useInstalledAgentSkillNames: () => ({
    installed: false,
    loading: false,
    settled: true,
    installedUnverifiable: false,
    error: null,
    skills: [],
    sources: [],
    refresh: provider.refresh
  }),
  useInstalledAgentSkill: () => ({
    installed: provider.installed,
    loading: false,
    error: null,
    skills: [],
    sources: [],
    refresh: provider.refresh
  })
}))
vi.mock('@/hooks/useLinearProviderConnected', () => ({ useLinearProviderConnected: () => true }))
vi.mock('@/components/linear-api-key-dialog', () => ({ LinearApiKeyDialog: () => null }))
vi.mock('./WslCliRegistration', () => ({ WslCliRegistration: () => null }))
vi.mock('./CliRegistrationDialog', () => ({ CliRegistrationDialog: () => null }))
vi.mock('@/hooks/useSkillFreshness', () => ({ refreshSkillFreshness: provider.freshness }))
vi.mock('./OrchestrationSkillAgentCoverage', () => ({
  OrchestrationSkillAgentCoverage: () => null
}))
vi.mock('../skills/SkillFreshnessStatusPill', () => ({ SkillFreshnessStatusPill: () => null }))
vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: () => null
}))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    agentRuntime: undefined,
    discoveryTarget: { kind: 'local' },
    canUseLocalSkillFreshness: true,
    installDisabledReason: provider.disabled || undefined
  })
}))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  'IS_REACT_ACT_ENVIRONMENT'
)
const originalFeatureState = {
  persistedUIReady: useAppStore.getState().persistedUIReady,
  featureInteractions: useAppStore.getState().featureInteractions
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true
  })
  vi.clearAllMocks()
  provider.installed = false
  provider.disabled = ''
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      cli: {
        getInstallStatus: async () => ({
          state: 'unsupported',
          supported: false,
          commandName: 'orca'
        })
      },
      ephemeralVm: { listRecipeCatalog: async () => [] },
      plugins: {},
      ui: { set: provider.persistUi }
    }
  })
  useAppStore.setState({
    activeModal: 'none',
    activeOrcaProfileId: 'first',
    settingsSearchQuery: ''
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(originalFeatureState)
  if (originalActEnvironment) {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', originalActEnvironment)
  } else {
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  }
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
function props(overrides: Partial<AgentSkillSetupPanelProps> = {}): AgentSkillSetupPanelProps {
  return {
    title: 'Test skill',
    description: '',
    command: 'fixture install',
    terminalTitle: 'Fixture setup',
    terminalAriaLabel: 'Fixture terminal',
    terminalWorktreeId: 'fixture-panel',
    installed: false,
    loading: false,
    error: null,
    onRecheck: provider.refresh,
    freshnessSkillName: 'fixture-skill',
    ...overrides
  }
}
async function recheck(panelKey: string) {
  const state = await apply({ kind: 'setup-form', action: { kind: 'get' } })
  if (!('setupPanels' in state)) {
    throw new Error('missing setup panels')
  }
  const panel = state.setupPanels.find((entry) => entry.panelKey === panelKey)
  if (!panel) {
    throw new Error('missing panel')
  }
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'setup-form',
      action: { kind: 'recheck', panelKey, reviewedTarget: panel.reviewedTarget }
    })
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('uses actual native and routed CLI recheck callbacks and publishes the same refresh surfaces', async () => {
  render(<AgentSkillSetupPanel {...props()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  await act(async () => undefined)
  expect(provider.refresh).toHaveBeenCalledOnce()
  expect(provider.surfaces).toHaveBeenCalledOnce()
  expect(provider.freshness).toHaveBeenCalledOnce()
  await recheck('fixture-panel')
  expect(provider.refresh).toHaveBeenCalledTimes(2)
  expect(provider.surfaces).toHaveBeenCalledTimes(2)
  expect(provider.freshness).toHaveBeenCalledTimes(2)
})
it('reaches the actual OrchestrationPane refresh through its actual setup panel', async () => {
  render(
    <OrchestrationPane
      settings={getDefaultSettings('/fixture')}
      updateSettings={async () => undefined}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  await act(async () => undefined)
  expect(provider.refresh).toHaveBeenCalledOnce()
  await recheck('settings-orchestration-skill-terminal')
  expect(provider.refresh).toHaveBeenCalledTimes(2)
  expect(provider.surfaces).toHaveBeenCalledTimes(2)
})
it('refuses loading and hidden recheck buttons without running their callbacks', async () => {
  const view = render(<AgentSkillSetupPanel {...props({ loading: true })} />)
  await expect(recheck('fixture-panel')).rejects.toThrow('skill_setup_recheck_unavailable')
  view.rerender(
    <AgentSkillSetupPanel {...props({ installed: true, showRecheckWhenInstalled: false })} />
  )
  expect(screen.queryByRole('button', { name: 'Re-check' })).toBeNull()
  await expect(recheck('fixture-panel')).rejects.toThrow('skill_setup_recheck_unavailable')
  expect(provider.refresh).not.toHaveBeenCalled()
})

it.each(['computer-use', 'ephemeral-vms', 'cli'])(
  'reaches the actual %s parent refresh with native and routed CLI',
  async (kind) => {
    const settings = getDefaultSettings('/fixture')
    render(
      kind === 'computer-use' ? (
        <ComputerUseSkillSetupPanel />
      ) : kind === 'ephemeral-vms' ? (
        <EphemeralVmsPane />
      ) : (
        <CliSection currentPlatform="darwin" settings={settings} />
      )
    )
    await act(async () => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
    await act(async () => undefined)
    expect(provider.refresh).toHaveBeenCalledOnce()
    const key =
      kind === 'cli' ? 'settings-cli-skill-terminal-host' : `settings-${kind}-skill-terminal`
    await recheck(key)
    expect(provider.refresh).toHaveBeenCalledTimes(2)
    expect(provider.surfaces).toHaveBeenCalledTimes(2)
  }
)

it.each(['linear-pane', 'task-linear', 'orchestration-card'])(
  'reaches actual %s parent refresh with native and routed CLI',
  async (kind) => {
    const skill: InstalledAgentSkillState = {
      installed: false,
      loading: false,
      settled: true,
      installedUnverifiable: false,
      error: null,
      skills: [],
      sources: [],
      refresh: async () => {
        await provider.refresh()
        return false
      }
    }
    render(
      kind === 'linear-pane' ? (
        <LinearAgentSkillPane />
      ) : kind === 'task-linear' ? (
        <TaskSourceLinearSetup
          connected
          checking={false}
          visible
          onToggleVisible={() => undefined}
          onOpenIntegrations={() => undefined}
          canHide
        />
      ) : (
        <OrchestrationSetupCard skill={skill} />
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
    await act(async () => undefined)
    expect(provider.refresh).toHaveBeenCalledOnce()
    const key =
      kind === 'linear-pane'
        ? 'settings-linear-skill-terminal'
        : kind === 'task-linear'
          ? 'settings-tasks-linear-skill-terminal'
          : 'feature-wall-orchestration-skill-terminal'
    await recheck(key)
    expect(provider.refresh).toHaveBeenCalledTimes(2)
    expect(provider.surfaces).toHaveBeenCalledTimes(2)
  }
)

it.each(['native', 'cli'])(
  'records the actual Computer Use setup interaction through %s',
  async (mode) => {
    useAppStore.setState({ persistedUIReady: true, featureInteractions: {} })
    render(
      <TooltipProvider>
        <ComputerUseSkillSetupPanel />
      </TooltipProvider>
    )
    if (mode === 'native') {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }))
      await act(async () => undefined)
    } else {
      const state = await apply({ kind: 'setup-form', action: { kind: 'get' } })
      if (!('setupPanels' in state) || !state.setupPanels[0]) {
        throw new Error('missing panel')
      }
      const panel = state.setupPanels[0]
      let pending: ReturnType<typeof apply> | undefined
      act(() => {
        pending = apply({
          kind: 'setup-form',
          action: {
            kind: 'open-terminal',
            panelKey: panel.panelKey,
            reviewedTarget: panel.reviewedTarget
          }
        })
        void pending.catch(() => undefined)
      })
      await act(async () => undefined)
      await pending
    }
    expect(useAppStore.getState().featureInteractions['computer-use-setup']?.interactionCount).toBe(
      1
    )
    expect(provider.persistUi).toHaveBeenCalledOnce()
  }
)

it('uses actual OrchestrationPane open/Done/Escape callbacks and routed CLI dialog state', async () => {
  render(
    <TooltipProvider>
      <OrchestrationPane
        settings={getDefaultSettings('/fixture')}
        updateSettings={async () => undefined}
      />
    </TooltipProvider>
  )
  const dialogState = async () => {
    const state = await apply({ kind: 'command-dialog-form', action: { kind: 'get' } })
    if (!('commandDialog' in state)) {
      throw new Error('missing command dialog')
    }
    return state.commandDialog
  }
  const change = async (open: boolean) => {
    const state = await dialogState()
    let pending: ReturnType<typeof apply> | undefined
    act(() => {
      pending = apply({
        kind: 'command-dialog-form',
        action: { kind: 'set-open', open, reviewedTarget: state.reviewedTarget }
      })
      void pending.catch(() => undefined)
    })
    await act(async () => undefined)
    return pending
  }
  expect((await dialogState()).open).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Copy install command' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect((await dialogState()).open).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  expect((await dialogState()).open).toBe(false)
  await change(true)
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await act(async () => undefined)
  expect((await dialogState()).open).toBe(false)
  await change(true)
  await change(false)
  expect(screen.queryByRole('dialog')).toBeNull()
})

it.each(['installed', 'disabled'])(
  'refuses an actual parent command hint hidden by %s or search',
  async (reason) => {
    provider.installed = reason === 'installed'
    provider.disabled = reason === 'disabled' ? 'fixture unavailable runtime' : ''
    render(
      <TooltipProvider>
        <OrchestrationPane
          settings={getDefaultSettings('/fixture')}
          updateSettings={async () => undefined}
        />
      </TooltipProvider>
    )
    expect(screen.queryByRole('button', { name: 'Copy install command' })).toBeNull()
    const state = await apply({ kind: 'command-dialog-form', action: { kind: 'get' } })
    if (!('commandDialog' in state)) {
      throw new Error('missing command dialog')
    }
    expect(state.commandDialog.canOpen).toBe(false)
    await expect(
      apply({
        kind: 'command-dialog-form',
        action: { kind: 'set-open', open: true, reviewedTarget: state.commandDialog.reviewedTarget }
      })
    ).rejects.toThrow('skill_command_dialog_unavailable')
    act(() => useAppStore.setState({ settingsSearchQuery: 'fixture-no-matching-setting' }))
    await expect(apply({ kind: 'command-dialog-form', action: { kind: 'get' } })).rejects.toThrow(
      'viewer_unavailable'
    )
  }
)
