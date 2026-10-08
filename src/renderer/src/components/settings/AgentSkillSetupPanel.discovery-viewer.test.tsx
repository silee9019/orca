// @vitest-environment happy-dom
import { act, useCallback, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentSkillSetupPanel } from './AgentSkillSetupPanel'
import { FloatingTerminalOrchestrationDialog } from '../floating-terminal/FloatingTerminalOrchestrationDialog'
import { LinearAgentSkillInstallCta } from './linear-agent-skill-install-cta'
import { LinearAgentSkillSetupDialog } from '../sidebar/LinearAgentSkillSetupDialog'
import { useInstalledAgentSkill } from '@/hooks/useInstalledAgentSkills'
import { TooltipProvider } from '../ui/tooltip'
import { applySkillsViewerRequest as apply } from '../../runtime/skills-viewer-request'
import { useAppStore } from '@/store'
const provider = vi.hoisted(() => ({ refresh: vi.fn(), surfaces: vi.fn(), freshness: vi.fn() }))
vi.mock('@/hooks/useInstalledAgentSkills', () => {
  function useDiscovery() {
    const [installed, setInstalled] = useState(false)
    const refresh = useCallback(async () => {
      provider.refresh()
      setInstalled(true)
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      return true
    }, [])
    return {
      installed,
      loading: false,
      error: null,
      settled: true,
      installedUnverifiable: false,
      skills: [],
      sources: [],
      refresh
    }
  }
  return {
    GLOBAL_AGENT_SKILL_SOURCE_KINDS: ['home'],
    hasInstalledAgentSkill: () => false,
    notifyInstalledAgentSkillsRefreshed: provider.surfaces,
    useInstalledAgentSkill: useDiscovery,
    useInstalledAgentSkillNames: useDiscovery
  }
})
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    agentRuntime: { runtime: 'host', label: 'Host' },
    canUseLocalSkillFreshness: true
  })
}))
vi.mock('@/hooks/useSkillFreshness', () => ({ refreshSkillFreshness: provider.freshness }))
vi.mock('../skills/SkillFreshnessStatusPill', () => ({ SkillFreshnessStatusPill: () => null }))
let finish: (() => void) | undefined
function Harness() {
  const [installed, setInstalled] = useState(false)
  const recheck = useCallback(async () => {
    provider.refresh()
    setInstalled(true)
    await new Promise<void>((resolve) => {
      finish = resolve
    })
  }, [])
  return (
    <AgentSkillSetupPanel
      title="Discovery"
      description={null}
      command="install"
      installedCommand="update"
      terminalTitle="Setup"
      terminalAriaLabel="Setup"
      terminalWorktreeId="discovery"
      installed={installed}
      loading={false}
      error={null}
      onRecheck={recheck}
      freshnessSkillName="fixture"
      onBeforeOpenTerminal={() => undefined}
    />
  )
}
function SidebarDialog() {
  const skill = useInstalledAgentSkill('orca-linear')
  return (
    <LinearAgentSkillSetupDialog
      open
      showSuccess={false}
      successDescription="Ready"
      missingLabel="Missing"
      command="install"
      installedCommand="update"
      installed={skill.installed}
      loading={skill.loading}
      error={skill.error}
      onRecheck={skill.refresh}
      onOpenChange={() => undefined}
      onDismissPermanently={() => undefined}
      onDone={() => undefined}
    />
  )
}
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  'IS_REACT_ACT_ENVIRONMENT'
)
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { platform: { get: () => ({ platform: 'win32' }) } }
  })
  finish = undefined
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true
  })
})
afterEach(() => {
  cleanup()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
  if (originalActEnvironment) {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', originalActEnvironment)
  } else {
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  }
})
it.each(['native', 'cli'])(
  'accepts its actual installed-state update through %s without changing discovery owner',
  async (mode) => {
    render(<Harness />)
    const result = await apply({ kind: 'setup-form', action: { kind: 'get' } })
    if (!('setupPanels' in result) || !result.setupPanels[0]) {
      throw new Error('missing discovery panel')
    }
    let pending: ReturnType<typeof apply> | undefined
    if (mode === 'native') {
      fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
    } else {
      const reviewedTarget = result.setupPanels[0].reviewedTarget
      act(() => {
        pending = apply({
          kind: 'setup-form',
          action: { kind: 'recheck', panelKey: 'discovery', reviewedTarget }
        })
        void pending.catch(() => undefined)
      })
    }
    await act(async () => undefined)
    expect(screen.getByRole('button', { name: 'Update' })).toBeTruthy()
    expect(provider.surfaces).not.toHaveBeenCalled()
    await act(async () => finish?.())
    if (mode === 'cli') {
      await expect(pending).resolves.toMatchObject({
        setupPanels: [{ installed: true, busy: false }]
      })
    }
    expect(provider.refresh).toHaveBeenCalledOnce()
    expect(provider.surfaces).toHaveBeenCalledOnce()
    expect(provider.freshness).toHaveBeenCalledOnce()
  }
)

it.each([
  ['floating', 'native'],
  ['floating', 'cli'],
  ['linear', 'native'],
  ['linear', 'cli'],
  ['sidebar', 'native'],
  ['sidebar', 'cli']
])('accepts actual %s parent discovery updates through %s', async (kind, mode) => {
  const setupChanged = vi.fn()
  render(
    <TooltipProvider>
      {kind === 'floating' ? (
        <FloatingTerminalOrchestrationDialog
          open
          onOpenChange={() => undefined}
          onSetupStateChange={setupChanged}
        />
      ) : kind === 'linear' ? (
        <LinearAgentSkillInstallCta settings={null} />
      ) : (
        <SidebarDialog />
      )}
    </TooltipProvider>
  )
  const result = await apply({ kind: 'setup-form', action: { kind: 'get' } })
  const key =
    kind === 'floating'
      ? 'floating-terminal-orchestration-skill-terminal'
      : kind === 'linear'
        ? 'settings-linear-install-command'
        : 'sidebar-linear-agent-skill-setup'
  if (!('setupPanels' in result)) {
    throw new Error('missing parent panels')
  }
  const panel = result.setupPanels.find((entry) => entry.panelKey === key)
  if (!panel) {
    throw new Error('missing parent')
  }
  let pending: ReturnType<typeof apply> | undefined
  if (mode === 'native') {
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  } else {
    act(() => {
      pending = apply({
        kind: 'setup-form',
        action: { kind: 'recheck', panelKey: key, reviewedTarget: panel.reviewedTarget }
      })
      void pending.catch(() => undefined)
    })
  }
  await act(async () => undefined)
  await act(async () => finish?.())
  if (mode === 'cli') {
    await expect(pending).resolves.toMatchObject({
      setupPanels: [{ installed: true, busy: false }]
    })
  }
  expect(provider.refresh).toHaveBeenCalledOnce()
  expect(provider.surfaces).toHaveBeenCalledTimes(kind === 'linear' ? 0 : 1)
  expect(provider.freshness).toHaveBeenCalledTimes(kind === 'floating' ? 1 : 0)
  expect(setupChanged).toHaveBeenCalledTimes(kind === 'floating' ? 1 : 0)
})
