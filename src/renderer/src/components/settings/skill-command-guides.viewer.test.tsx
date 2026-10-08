// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalAgentRuntime } from './CliSkillRuntimeSetup'
import { CliSkillSetupTerminal } from '../feature-tips/CliSkillSetupTerminal'
import { OrchestrationSkillPromptDialog } from './OrchestrationSkillPromptDialog'
import { LinearAgentSkillInstallCta } from './linear-agent-skill-install-cta'
import { TooltipProvider } from '../ui/tooltip'
import { applySkillsViewerRequest as apply } from '../../runtime/skills-viewer-request'
import { useAppStore } from '@/store'
import {
  ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND,
  ORCA_LINEAR_SKILL_INSTALL_COMMAND
} from '@/lib/agent-feature-install-commands'
const provider = vi.hoisted(() => ({
  clipboard: vi.fn(async (_text: string) => undefined),
  refresh: vi.fn(async () => false),
  success: vi.fn(),
  error: vi.fn(),
  runtime: vi.fn((): { agentRuntime: LocalAgentRuntime; terminalShellOverride?: string } => ({
    agentRuntime: { runtime: 'host', label: 'Host' }
  }))
}))
vi.mock('sonner', () => ({ toast: { success: provider.success, error: provider.error } }))
vi.mock('@/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: provider.runtime
}))
vi.mock('../onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: () => null
}))
vi.mock('@/hooks/useInstalledAgentSkills', () => ({
  GLOBAL_AGENT_SKILL_SOURCE_KINDS: ['home'],
  useInstalledAgentSkillNames: () => ({
    installed: false,
    loading: false,
    error: null,
    skills: [],
    sources: [],
    refresh: provider.refresh
  })
}))
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const originalActEnvironment = Object.getOwnPropertyDescriptor(
  globalThis,
  'IS_REACT_ACT_ENVIRONMENT'
)
beforeEach(() => {
  vi.clearAllMocks()
  provider.clipboard.mockResolvedValue(undefined)
  provider.runtime.mockReturnValue({ agentRuntime: { runtime: 'host', label: 'Host' } })
  useAppStore.setState({ activeModal: 'none', activeOrcaProfileId: 'first' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: { writeClipboardText: provider.clipboard },
      platform: { get: () => ({ platform: 'win32' }) }
    }
  })
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
async function panel(key: string) {
  const state = await apply({ kind: 'setup-form', action: { kind: 'get' } })
  if (!('setupPanels' in state)) {
    throw new Error('missing setup state')
  }
  const current = state.setupPanels.find((entry) => entry.panelKey === key)
  if (!current) {
    throw new Error('missing guide')
  }
  return current
}
async function copy(key: string, reviewedTarget?: string) {
  return apply({
    kind: 'setup-form',
    action: {
      kind: 'copy-command',
      panelKey: key,
      reviewedTarget: reviewedTarget ?? (await panel(key)).reviewedTarget
    }
  })
}
const guides = [
  {
    key: 'feature-tip-cli-skills-terminal',
    element: <CliSkillSetupTerminal />,
    button: 'Copy skill install command',
    command: ORCA_CLI_ORCHESTRATION_SKILL_INSTALL_COMMAND
  },
  {
    key: 'settings-orchestration-command-prompt',
    element: (
      <OrchestrationSkillPromptDialog
        command="fixture orchestration install"
        open
        onOpenChange={() => undefined}
      />
    ),
    button: 'Copy orchestration skill install command',
    command: 'fixture orchestration install'
  },
  {
    key: 'settings-linear-install-command',
    element: <LinearAgentSkillInstallCta settings={null} />,
    button: 'Copy command',
    command: ORCA_LINEAR_SKILL_INSTALL_COMMAND
  }
]
it.each(guides)(
  'shares actual native and CLI copy for $key and reports clipboard failure',
  async ({ key, element, button, command }) => {
    render(<TooltipProvider>{element}</TooltipProvider>)
    fireEvent.click(screen.getByRole('button', { name: button }))
    await act(async () => undefined)
    await expect(copy(key)).resolves.toMatchObject({
      setupPanels: [{ canCopy: true, busy: false }]
    })
    const copied = provider.clipboard.mock.calls[0]?.[0]
    expect(copied).toContain(command)
    expect(provider.clipboard.mock.calls).toEqual([[copied], [copied]])
    if (key !== 'settings-orchestration-command-prompt') {
      expect(copied).toMatch(/^cmd\.exe \/d \/s \/c /)
    }
    expect(provider.success).toHaveBeenCalledTimes(2)
    provider.clipboard.mockRejectedValueOnce(new Error('fixture clipboard'))
    await expect(copy(key)).rejects.toThrow('skill_setup_copy_failed')
    expect(provider.error).toHaveBeenCalledWith('fixture clipboard')
    expect(provider.success).toHaveBeenCalledTimes(2)
    const state = await panel(key)
    expect(state.installed).toBe(key === 'settings-linear-install-command' ? false : null)
    expect(state.canOpen).toBe(false)
  }
)
it('invalidates command and closed-dialog reviews without copying a different command', async () => {
  const view = render(
    <OrchestrationSkillPromptDialog command="first" open onOpenChange={() => undefined} />
  )
  const key = 'settings-orchestration-command-prompt'
  const old = await panel(key)
  view.rerender(
    <OrchestrationSkillPromptDialog command="second" open onOpenChange={() => undefined} />
  )
  view.rerender(
    <OrchestrationSkillPromptDialog command="first" open onOpenChange={() => undefined} />
  )
  await expect(copy(key, old.reviewedTarget)).rejects.toThrow('viewer_target_changed')
  view.rerender(
    <OrchestrationSkillPromptDialog command="first" open={false} onOpenChange={() => undefined} />
  )
  await expect(copy(key)).rejects.toThrow('skill_setup_copy-command_unavailable')
  expect(provider.clipboard).not.toHaveBeenCalled()
})
it('invalidates CLI setup reviews when the real WSL/runtime command owner changes and returns', async () => {
  const view = render(
    <TooltipProvider>
      <CliSkillSetupTerminal />
    </TooltipProvider>
  )
  const key = 'feature-tip-cli-skills-terminal'
  const old = await panel(key)
  provider.runtime.mockReturnValue({
    agentRuntime: { runtime: 'wsl', wslDistro: 'Ubuntu', label: 'WSL Ubuntu' },
    terminalShellOverride: 'powershell.exe'
  })
  view.rerender(
    <TooltipProvider>
      <CliSkillSetupTerminal />
    </TooltipProvider>
  )
  provider.runtime.mockReturnValue({ agentRuntime: { runtime: 'host', label: 'Host' } })
  view.rerender(
    <TooltipProvider>
      <CliSkillSetupTerminal />
    </TooltipProvider>
  )
  await expect(copy(key, old.reviewedTarget)).rejects.toThrow('viewer_target_changed')
  expect(provider.clipboard).not.toHaveBeenCalled()
})
it('uses actual Linear CTA discovery refresh for native and CLI rechecks', async () => {
  render(
    <TooltipProvider>
      <LinearAgentSkillInstallCta settings={null} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
  await act(async () => undefined)
  const current = await panel('settings-linear-install-command')
  await apply({
    kind: 'setup-form',
    action: { kind: 'recheck', panelKey: current.panelKey, reviewedTarget: current.reviewedTarget }
  })
  expect(provider.refresh).toHaveBeenCalledTimes(2)
})
