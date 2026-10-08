// @vitest-environment happy-dom
import { act, type ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentSkillSetupPanel } from './AgentSkillSetupPanel'
import { TooltipProvider } from '../ui/tooltip'
import { applySkillsViewerRequest } from '../../runtime/skills-viewer-request'
import { useAppStore } from '@/store'
const provider = vi.hoisted(() => ({
  terminal: vi.fn(
    (_props: {
      command: string
      description: string
      onTerminalExit?: () => void
      onCommandFinished?: (code: number | null) => void
    }) => null
  ),
  refreshed: vi.fn(),
  freshness: vi.fn()
}))
vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: provider.terminal
}))
vi.mock('../skills/SkillFreshnessStatusPill', () => ({ SkillFreshnessStatusPill: () => null }))
vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  notifyInstalledAgentSkillsRefreshed: provider.refreshed
}))
vi.mock('@/hooks/useSkillFreshness', () => ({ refreshSkillFreshness: provider.freshness }))
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  'IS_REACT_ACT_ENVIRONMENT'
)
const refresh = vi.fn(async () => undefined)
const props: ComponentProps<typeof AgentSkillSetupPanel> = {
  title: 'Setup',
  description: null,
  command: 'install-command',
  installedCommand: 'update-command',
  terminalTitle: 'Setup',
  terminalAriaLabel: 'Setup terminal',
  terminalWorktreeId: 'panel',
  installed: false,
  loading: false,
  error: null,
  onRecheck: refresh,
  freshnessSkillName: 'orca-cli'
}
function Panel(overrides: Partial<ComponentProps<typeof AgentSkillSetupPanel>>) {
  return (
    <TooltipProvider>
      <AgentSkillSetupPanel {...props} {...overrides} />
    </TooltipProvider>
  )
}
async function state() {
  const result = await applySkillsViewerRequest({ kind: 'setup-form', action: { kind: 'get' } })
  if (!('setupPanels' in result) || !result.setupPanels[0]) {
    throw new Error('missing setup panel')
  }
  return result.setupPanels[0]
}
async function request(reviewedTarget?: string) {
  return applySkillsViewerRequest({
    kind: 'setup-form',
    action: {
      kind: 'open-terminal',
      panelKey: 'panel',
      reviewedTarget: reviewedTarget ?? (await state()).reviewedTarget
    }
  })
}
async function open(mode: string, label = 'Install') {
  if (mode === 'native') {
    fireEvent.click(screen.getByRole('button', { name: label }))
    await act(async () => undefined)
  } else {
    let pending: ReturnType<typeof request> | undefined
    const target = (await state()).reviewedTarget
    act(() => {
      pending = request(target)
      void pending.catch(() => undefined)
    })
    await act(async () => undefined)
    await pending
  }
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true
  })
  vi.clearAllMocks()
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
})
afterEach(() => {
  cleanup()
  if (originalActEnvironment) {
    Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', originalActEnvironment)
  } else {
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  }
})
it.each(['native', 'cli'])(
  'opens, retries and observes command completion through %s',
  async (mode) => {
    render(<Panel />)
    await open(mode)
    expect(await state()).toMatchObject({
      terminalOpen: true,
      terminalAttempt: 1,
      setupRunning: true,
      canOpen: false
    })
    expect(provider.terminal.mock.calls.at(-1)?.[0]).toMatchObject({
      command: 'install-command',
      description: 'Press Enter to run the command.'
    })
    await expect(request()).rejects.toThrow('skill_setup_open-terminal_unavailable')
    await act(async () => {
      provider.terminal.mock.calls.at(-1)?.[0].onCommandFinished?.(7)
      provider.terminal.mock.calls.at(-1)?.[0].onCommandFinished?.(7)
    })
    expect(refresh).toHaveBeenCalledOnce()
    expect(provider.refreshed).toHaveBeenCalledOnce()
    expect(provider.freshness).toHaveBeenCalledOnce()
    expect(await state()).toMatchObject({ failedCode: 7, setupRunning: false, canOpen: true })
    await open(mode, 'Retry')
    expect(await state()).toMatchObject({
      terminalOpen: true,
      terminalAttempt: 2,
      setupRunning: true
    })
    await act(async () => provider.terminal.mock.calls.at(-1)?.[0].onCommandFinished?.(0))
    await act(async () => provider.terminal.mock.calls.at(-1)?.[0].onTerminalExit?.())
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(await state()).toMatchObject({
      terminalOpen: false,
      setupRunning: false,
      failedCode: null
    })
  }
)
it.each(['native', 'cli'])(
  'opens the installed update and rechecks shell exit through %s',
  async (mode) => {
    render(<Panel installed />)
    await open(mode, 'Update')
    expect(provider.terminal.mock.calls.at(-1)?.[0].command).toBe('update-command')
    await act(async () => provider.terminal.mock.calls.at(-1)?.[0].onTerminalExit?.())
    expect(refresh).toHaveBeenCalledOnce()
    expect(provider.refreshed).toHaveBeenCalledOnce()
    expect(await state()).toMatchObject({ terminalOpen: false, setupRunning: false })
  }
)
it.each(['owner', 'profile', 'modal', 'source', 'permission', 'installed', 'unmount'])(
  'cancels held preflight after %s changes without opening a late terminal',
  async (change) => {
    let finish: (() => void) | undefined
    const before = () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
    const view = render(<Panel onBeforeOpenTerminal={before} />)
    const old = (await state()).reviewedTarget
    let pending: ReturnType<typeof request> | undefined
    act(() => {
      pending = request(old)
      void pending.catch(() => undefined)
    })
    await act(async () => undefined)
    await expect(request()).rejects.toThrow('viewer_busy')
    if (change === 'owner') {
      view.rerender(<Panel command="other-command" onBeforeOpenTerminal={before} />)
      view.rerender(<Panel onBeforeOpenTerminal={before} />)
    }
    if (change === 'profile') {
      act(() => useAppStore.setState({ activeOrcaProfileId: 'other' }))
      act(() => useAppStore.setState({ activeOrcaProfileId: 'first' }))
    }
    if (change === 'modal') {
      act(() => useAppStore.setState({ activeModal: 'create-worktree' }))
    }
    if (change === 'source') {
      view.rerender(<Panel onRecheck={async () => undefined} onBeforeOpenTerminal={before} />)
      view.rerender(<Panel onBeforeOpenTerminal={before} />)
    }
    if (change === 'permission') {
      view.rerender(<Panel installDisabled onBeforeOpenTerminal={before} />)
      view.rerender(<Panel onBeforeOpenTerminal={before} />)
    }
    if (change === 'installed') {
      view.rerender(<Panel installed onBeforeOpenTerminal={before} />)
      view.rerender(<Panel onBeforeOpenTerminal={before} />)
    }
    if (change === 'unmount') {
      view.unmount()
    }
    await expect(pending).rejects.toThrow(
      change === 'unmount' ? 'viewer_unmounted' : 'viewer_target_changed'
    )
    await act(async () => finish?.())
    expect(provider.terminal).not.toHaveBeenCalled()
  }
)
it('refuses disabled/hidden installs and reports preflight failure before permitting retry', async () => {
  const before = vi.fn(async (): Promise<void> => {
    throw new Error('fixture preflight')
  })
  const view = render(<Panel installDisabled onBeforeOpenTerminal={before} />)
  await expect(request()).rejects.toThrow('skill_setup_open-terminal_unavailable')
  view.rerender(<Panel installed showInstallWhenInstalled={false} onBeforeOpenTerminal={before} />)
  await expect(request()).rejects.toThrow('skill_setup_open-terminal_unavailable')
  view.rerender(<Panel onBeforeOpenTerminal={before} />)
  let pending: ReturnType<typeof request> | undefined
  act(() => {
    pending = request()
    void pending.catch(() => undefined)
  })
  await act(async () => undefined)
  await expect(pending).rejects.toThrow('skill_setup_open_failed')
  expect(provider.terminal).not.toHaveBeenCalled()
  expect(await state()).toMatchObject({ terminalOpen: false, busy: false, canOpen: true })
  before.mockResolvedValue(undefined)
  await open('cli')
  expect(provider.terminal).toHaveBeenCalled()
})

it('finishes the captured preflight when a parent recreates its callback for the same target', async () => {
  let finish: (() => void) | undefined
  const before = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  const other = vi.fn(async () => undefined)
  const view = render(<Panel onBeforeOpenTerminal={before} />)
  const target = (await state()).reviewedTarget
  let pending: ReturnType<typeof request> | undefined
  act(() => {
    pending = request(target)
    void pending.catch(() => undefined)
  })
  await act(async () => undefined)
  view.rerender(<Panel onBeforeOpenTerminal={other} />)
  await act(async () => finish?.())
  await expect(pending).resolves.toMatchObject({
    setupPanels: [{ terminalOpen: true, terminalAttempt: 1 }]
  })
  expect(before).toHaveBeenCalledOnce()
  expect(other).not.toHaveBeenCalled()
})
